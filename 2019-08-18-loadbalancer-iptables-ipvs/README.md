# Load balancing with iptables and IPVS

Usually, when we talk about load balancing we talk about [NGINX](https://www.nginx.com/), [HAProxy](http://www.haproxy.org/) or other user space load balancers. But it's also possible do with [iptables](https://en.wikipedia.org/wiki/Iptables) or with [IPVS](https://en.wikipedia.org/wiki/IP_Virtual_Server).

  - [Infrastructure](#infrastructure)
  - [Iptables](#iptables)
    - [nth mode](#nth-mode)
    - [random mode](#random-mode)
  - [Affinity with iptables](#affinity-with-iptables)
  - [Virtual IP](#virtual-ip)
  - [IPVS](#ipvs)
    - [IPVS NAT](#ipvs-nat)
    - [IPVS DR](#ipvs-dr)

## Infrastructure

For testing will be enough run 3 containers. Everything described in [docker-compose.yml](./docker-compose.yml).

As base image we will use `nginx:1.17.2-alpine` and add tools like `curl iptables ipvsadm tcpdump` (see [Dockerfile](./Dockerfile)).

You do not need build image yourself, `docker-compose` will do it for you:

```bash
docker-compose -p loadbalancer up --build -d
docker-compose -p loadbalancer down
```

Except 3 containers compose file create network `172.31.0.0/16`.

Created containers includes:

  - `balancer` — `172.31.0.2`
  - `nginx0` — `172.31.2.0`
  - `nginx1` — `172.31.2.1`

NGINX containers will respond with container hostname on each HTTP request on port 80, while `balancer` just start with infinity loop, so we can connect to it and type our commands (`docker exec -it loadbalancer_balancer0_1 sh`).

### Iptables

On iptables we can do load balancing with [statistic extension](http://ipset.netfilter.org/iptables-extensions.man.html#lbCD). First we need change destination of packet (ip / port), so packet will be sent to one of real servers. Second we need change packet source, because otherwise real server will send packet back to client, but client will expect packet from our balancer, so request will never be successful.

##### nth mode

`nth` mode in statistic extension, on balancer:

```bash
iptables -t nat -A PREROUTING -p tcp -d 172.31.0.2 --dport 8000 -j DNAT --to-destination 172.31.2.0:80 -m statistic --mode nth --every 2 --packet 0
iptables -t nat -A PREROUTING -p tcp -d 172.31.0.2 --dport 8000 -j DNAT --to-destination 172.31.2.1:80
iptables -t nat -A POSTROUTING -p tcp -d 172.31.2.0,172.31.2.1 --dport 80 -j SNAT --to-source 172.31.0.2
```

By these commands we:

  - Change destination address to `172.31.2.0:80` for every second packet where destination is `172.31.0.2:8000`.
  - Change destination address to `172.31.2.1:80` for everything rest what came to `172.31.0.2:8000`.
  - Change packet source to `172.31.0.2` (our balancer). We do not need rules for backward translation, because this be done automatically.

Now on host system:

```bash
$ for i in $(seq 1 5); do curl 172.31.0.2:8000; done
nginx0
nginx1
nginx0
nginx1
nginx0
```

Great, it's works!

One important note here, that it's not fully right to say that each second packet going to first real server, because if it was true then we would never receive successfull response for our HTTP request. In reality packets which belongs to one connection always going to real server with which connection already established.

##### random mode

Idea for `random` mode is same as for `nth` mode. We change destination and then change source, but unlike `nth` there should not be counters for each rule.

```bash
iptables -t nat -A PREROUTING -p tcp -d 172.31.0.2 --dport 8000 -j DNAT --to-destination 172.31.2.0:80 -m statistic --mode random --probability 0.5
iptables -t nat -A PREROUTING -p tcp -d 172.31.0.2 --dport 8000 -j DNAT --to-destination 172.31.2.1:80
iptables -t nat -A POSTROUTING -p tcp -d 172.31.2.0,172.31.2.1 --dport 80 -j SNAT --to-source 172.31.0.2
```

If we want equal distribution between real servers, probabilty should be calculated in next way: `p = 1 / (n - i)`. Where `p` is probability, `n` total number of real servers, `i` rule number started from zero.

For example if we have 5 endpoints, probabilty should be `1/5` => `1/4` => `1/3` => `1/2` => `1`, so each real server will have probability `1/5`:

```bash
1th endpoint: 1/5
2th endpoint: 4/5 * 1/4 = 1/5
3th endpoint: 4/5 * 3/4 * 1/3 = 1/5
4th endpoint: 4/5 * 3/4 * 2/3 * 1/2 = 1/5
5th endpoint: 4/5 * 3/4 * 2/3 * 1/2 * 1 = 1/5
```

### Affinity with iptables

While load balancing with `random` / `nth` can be enough for us, sometimes we need add affinity, so each time when we receive request from one client we send it to same real server.

And this possible do with [recent extension](http://ipset.netfilter.org/iptables-extensions.man.html#lbBW). Unfortunately affinity can be implemented only by packaet source address and only for some period of time.

```bash
iptables -t nat -A PREROUTING -p tcp -d 172.31.0.2 --dport 8000 -m recent --update --seconds 1 --reap --name lb0 --mask 255.255.255.255 --rsource -j DNAT --to-destination 172.31.2.0:80
iptables -t nat -A PREROUTING -p tcp -d 172.31.0.2 --dport 8000 -m recent --update --seconds 1 --reap --name lb1 --mask 255.255.255.255 --rsource -j DNAT --to-destination 172.31.2.1:80
iptables -t nat -A PREROUTING -p tcp -d 172.31.0.2 --dport 8000 -m statistic --mode nth --every 2 --packet 0 -m recent --set --name lb0 --mask 255.255.255.255 --rsource -j DNAT --to-destination 172.31.2.0:80
iptables -t nat -A PREROUTING -p tcp -d 172.31.0.2 --dport 8000 -m recent --set --name lb1 --mask 255.255.255.255 --rsource -j DNAT --to-destination 172.31.2.1:80
iptables -t nat -A POSTROUTING -p tcp -d 172.31.2.0,172.31.2.1 --dport 80 -j SNAT --to-source 172.31.0.2
```

There more rules than with `statistic`, and IP addresses repeated twice. Idea is simple:

  - On first two rules we check that address in list `lb0` / `lb1` and if so we update `last seen` timestamp, plus change packet destination.
  - On two second rules we add each second packet to list `lb0` and add rest packets to `lb1`, plus change packet destination as in previous two rules.
  - Last 5 rule change source address.

On host system:

```bash
$ for i in $(seq 1 5); do curl 172.31.0.2:8000; done
nginx0
nginx0
nginx0
nginx0
nginx0
$ for i in $(seq 1 5); do curl 172.31.0.2:8000; sleep 1.1; done
nginx1
nginx0
nginx1
nginx0
nginx1
```

On second command we have interval bigger than timeout for affinity, so request going to different server each time.

While we have 2 real servers it's can be OK create such rules, but with more real services better use user-defined chains:

```bash
iptables -t nat -N LB
iptables -t nat -N LB0
iptables -t nat -N LB1
iptables -t nat -A PREROUTING -p tcp -d 172.31.0.2 --dport 8000 -j LB
iptables -t nat -A LB -m recent --rcheck --seconds 3 --reap --name lb0 --mask 255.255.255.255 --rsource -j LB0
iptables -t nat -A LB -m recent --rcheck --seconds 3 --reap --name lb1 --mask 255.255.255.255 --rsource -j LB1
iptables -t nat -A LB -m statistic --mode random --probability 0.5 -j LB0
iptables -t nat -A LB -j LB1
iptables -t nat -A LB0 -p tcp -m recent --set --name lb0 --mask 255.255.255.255 --rsource -m tcp -j DNAT --to-destination 172.31.2.0:80
iptables -t nat -A LB1 -p tcp -m recent --set --name lb1 --mask 255.255.255.255 --rsource -m tcp -j DNAT --to-destination 172.31.2.1:80
iptables -t nat -A POSTROUTING -p tcp -d 172.31.2.0,172.31.2.1 --dport 80 -j SNAT --to-source 172.31.0.2
```

[Kubernetes Service](https://kubernetes.io/docs/concepts/services-networking/service/) uses nearly such way for affinity in iptables mode (see `service.spec.sessionAffinity`).

### Virtual IP

If requests to real server will be created on balancer our rules created previously will not work, because packets from local process going through `OUTPUT` chain, not through `PREROUTING`. But more important thing in this case, that you can send requests to not exited IP addresses. Of course you will need scripts / software which will update rules, in Kubernetes [kube-proxy](https://kubernetes.io/docs/concepts/overview/components/#kube-proxy) do this work.

```bash
iptables -t nat -A OUTPUT -p tcp -d 172.31.0.3 --dport 8000 -j DNAT --to-destination 172.31.2.0:80 -m statistic --mode nth --every 2 --packet 0
iptables -t nat -A OUTPUT -p tcp -d 172.31.0.3 --dport 8000 -j DNAT --to-destination 172.31.2.1:80
```

and on balancer (where we applied these rules):

```bash
$ for i in $(seq 1 5); do curl 172.31.0.3:8000; done
nginx0
nginx1
nginx0
nginx1
nginx0
```

### IPVS

While `iptables` works, we can use better thing, IPVS: [IP Virtual Server](http://www.linuxvirtualserver.org/software/ipvs.html). IPVS implement transport layer load balancing inside the Linux kernel.

IPVS have few advantages compare to balancing through iptables:

  - More scheduling modes: `Robin Robin` / `Weighted Round Robin` / `Least-Connection` / `Weighted Least-Connection` / `Locality-Based Least-Connection` / `Locality-Based Least-Connection with Replication` / `Destination Hashing` / `Source Hashing` / `Shortest Expected Delay` / `Never Queue` (for full description see `scheduling-method` in ipvsadm man: https://linux.die.net/man/8/ipvsadm).
  - IPVS uses hash table instead chains which require less time for taking decision.
  - It's possible use gatewaying (direct routing) mode, which means that real servers will send packets back to client **directly**.

##### IPVS NAT

IPVS NAT is actual in case when connection initiator located on balancer itself (i.e. where virtual servers defined), otherwise better use `Direct Routing` mode. NAT mode allow us redefine destination port and address, so it's also possible use Virtual IP addresses.

Let's attach to our balancer container and run:

```bash
ipvsadm -A -t 172.31.0.3:8000 -s rr
ipvsadm -a -t 172.31.0.3:8000 -r 172.31.2.0:80 -m
ipvsadm -a -t 172.31.0.3:8000 -r 172.31.2.1:80 -m
ipvsadm -l -n
```

as result you should see:

```bash
IP Virtual Server version 1.2.1 (size=4096)
Prot LocalAddress:Port Scheduler Flags
  -> RemoteAddress:Port           Forward Weight ActiveConn InActConn
TCP  172.31.0.3:8000 rr
  -> 172.31.2.0:80                Masq    1      0          0
  -> 172.31.2.1:80                Masq    1      0          0
```

And now run `curl` in loop on balancer:

```bash
$ for i in $(seq 1 5); do curl 172.31.0.3:8000; done
nginx1
nginx0
nginx1
nginx0
nginx1
```

It's really great, here we make requests to Virtual IP which not defined in network at all. IPVS match this IP and port and send request to real servers in defined mode (`Round Robin` here).

##### IPVS DR

Direct Mode is little harder for setup and we need to solve [ARP problem](http://www.austintek.com/LVS/LVS-HOWTO/HOWTO/LVS-HOWTO.arp_problem.html). [ARP](https://en.wikipedia.org/wiki/Address_Resolution_Protocol) means Address Resolution Protocol and it's used for discovering link layer address ([MAC address](https://en.wikipedia.org/wiki/MAC_address)).

Problem with ARP that we should hide Virtual IP on our real servers, while on balancer we should respond for ARP requests (i.e. allow to clients send packets to balancer on Virtual IP, i.e. allow locate MAC by Virtual IP).

If you carefully checked [docker-compose.yml](./docker-compose.yml) file you possible noted that NGINX containers have 2 sysctl options: `net.ipv4.conf.eth0.arp_ignore: 1` and `net.ipv4.conf.eth0.arp_announce: 2`. These options allow us hide Virtual IP on real servers and we should add Virtual IP to loopback device for this ([link to LVS Knowledge Base](http://kb.linuxvirtualserver.org/wiki/Using_arp_announce/arp_ignore_to_disable_ARP)).

When you run containers with `docker-compose` you need add Virtual IP address on balancer:

```bash
ip address add 172.31.0.3/32 dev eth0
```

and in both NGINX containers:

```bash
ip address add 172.31.0.3/32 dev lo
```

Now we can create Virtual Service on balancer:

```bash
ipvsadm -A -t 172.31.0.3:80 -s rr
ipvsadm -a -t 172.31.0.3:80 -r 172.31.2.0:80 -g
ipvsadm -a -t 172.31.0.3:80 -r 172.31.2.1:80 -g
```

Important note here that we can not change destination port, because if we do this real server will send packet back to client to wrong port (to changed).

And test it on host system:

```bash
$ for i in $(seq 1 5); do curl 172.31.0.3:80; done
nginx1
nginx0
nginx1
nginx0
nginx1
```

You can check traffic with `tcpdump` (`tcpdump -ni eth0 tcp and port 80`) on balancer and in NGINX containers. On balancer you will see only packets `172.31.0.1.xxxxx > 172.31.0.3.80`, while in NGINX packets from `172.31.0.1.xxxxx > 172.31.0.3.80` and back `172.31.0.3.80 > 172.31.0.1.xxxxx`.
