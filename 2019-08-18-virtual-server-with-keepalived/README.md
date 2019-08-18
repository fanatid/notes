# Virtual Server with keepalived

I already described how setup [failover IP with keepalived](../2019-08-06-hetzner-cloud-internal-failover-ip) and how use [IPVS](../2019-08-18-loadbalancer-iptables-ipvs) for load balancing, but keepalive can be used for Virtual Server and this note show how do this.

## Infrastructure

In this note we will use docker containers again, it's enough for demonstration.

Docker image ([Dockerfile](./Dockerfile)) built on `nginx:1.17.2-alpine`, we also add [keepalived](https://www.keepalived.org/) and copy [keepalived.conf](./keepalived.conf) to `/etc/keepalived/keepalived.conf`.

[docker-compose.yml](./docker-compose.yml) define 4 containers: 2 nginx and 2 virtual servers (it's possible and better locate nginx and virtual server at one instance, but for demonstration in containers easier use them in different containers).

  - `nginx0` — `172.31.1.0`
  - `nginx1` — `172.31.1.1`
  - `vs0` — `172.31.2.0`
  - `vs1` — `172.31.2.1`

Our Virtual IP will be `172.31.2.2`. For all containers we need `NET_ADMIN` capability, because we need do network management in each container. NGINX containers also have sysctl options for ARP and they add our Virtual IP to loopback interface on container startup. They also link hostname to `index.html`, so launched [NGINX](https://www.nginx.com/) start response with container hostname. `vs` containers adjust `keepalived.conf` on startup and run `keepalived` without demonization.

For starting and stopping you can use:

```bash
docker-compose -p keepalived up --build -d
docker-compose -p keepalived down
```

### keepalived.conf

Most important thing in this note is [keepalived.conf](./keepalived.conf).

In `vrrp_instance` section we define instance `nginx` which have Virtual IP `172.31.2.2/32` which should be attached to `eth0`. We also have 2 IP of `vs` containers in `unicast_peer`, but on startup IP of started container will be commented, so `keepalived` in this container will ping only another peer.

In other section `virtual_server` we define Virtual Server on our Virtual IP on port 80 (`172.31.2.2:80`). We also define two real servers on `172.31.1.0` / `172.31.1.1` and can do this only on port 80, because define DR mode for IPVS.

### Observing

Let's start all containers and fetch logs in following mode for `vs` containers:

```bash
docker logs -f keepalived_vs0_1
docker logs -f keepalived_vs1_1
```

In my case `keepalived_vs1_1` was entered to MASTER state, which means that this container have our Virtual IP right now. From host system:

```bash
$ for i in $(seq 1 5); do curl 172.31.2.2; done
nginx1
nginx0
nginx1
nginx0
nginx1
```

Now, let's stop first NGINX container and run `curl` in loop again:

```bash
$ docker stop keepalived_nginx0_1
$ for i in $(seq 1 5); do curl 172.31.2.2; done
nginx1
nginx1
nginx1
nginx1
nginx1
```

`keepalived` discovered that `HTTP_GET` check for real server failed and removed service from list, in logs:

```bash
Sun Aug 18 19:03:04 2019: HTTP_CHECK on service [172.31.1.0]:tcp:80 failed after 1 retry.
Sun Aug 18 19:03:04 2019: Removing service [172.31.1.0]:tcp:80 to VS [172.31.2.2]:tcp:80
```

Now let's stop container in MASTER state and run `curl` in loop again:

```bash
$ docker stop keepalived_vs1_1
$ for i in $(seq 1 5); do curl 172.31.2.2; done
nginx1
nginx1
nginx1
nginx1
nginx1
```

Everything still works, but now Virtual IP located on `keepalived_vs0_1`, in logs:

```bash
Sun Aug 18 19:06:52 2019: (nginx) Entering MASTER STATE
Sun Aug 18 19:06:52 2019: (nginx) setting VIPs.
Sun Aug 18 19:06:52 2019: Sending gratuitous ARP on eth0 for 172.31.2.2
```

Now let's return stopped first NGINX container back to life and run `curl` in loop:

```bash
$ docker start keepalived_nginx0_1
$ for i in $(seq 1 5); do curl 172.31.2.2; done
nginx0
nginx1
nginx0
nginx1
nginx0
```

in logs of `keepalived_vs0_1`:

```bash
Sun Aug 18 19:08:55 2019: HTTP status code success to [172.31.1.0]:tcp:80 url(1).
Sun Aug 18 19:08:55 2019: Remote Web server [172.31.1.0]:tcp:80 succeed on service.
Sun Aug 18 19:08:55 2019: Adding service [172.31.1.0]:tcp:80 to VS [172.31.2.2]:tcp:80
```

### Result

With these actions we can see that probes and Virtual IP changes works. Of course, failover is not instant, it's takes few seconds for both Virtual Server and Virtual IP, but such operations should not be too often, so probably this enough in most cases.
