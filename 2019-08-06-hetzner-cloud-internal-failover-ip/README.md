# Internal failover IP in Hetzner Cloud

It's great when in cloud you can just click-click or create highly-availale loadbalancer through API (or with tools like [Terraform](https://www.terraform.io/)). But what if you need implement custom checks or your cloud not provide HA loadbalancers? Or even more, you use bare metal. In such case you can implement it yourself.

In this note I'll describe how IP failover can be done in [Hetzner Cloud](https://www.hetzner.com/cloud). I'll talk about internal failover IP, but implement same for public address should not have big difference.

### Infrastructure

![Alt text](https://g.gravizo.com/source/graphviz1?https://raw.githubusercontent.com/fanatid/notes/master/2019-08-06-hetzner-cloud-internal-failover-ip/README.md)
<!--
graphviz1
  digraph G {
    node [shape=box];
    rankdir=LR;
    ranksep=1;
    nodesep=1;

    subgraph cluster {
      label="Hetzner Private Network\n10.0.0.0/8";
      gateway [label="Network Gateway\n10.0.0.1"];

      subgraph cluster_test_subnet {
        label="Test Subnet\n10.0.2.0/24";

        subgraph cluster_test {
          label="Test Server";
          test [label="<eth0> eth0\n116.203.196.246|<ens10> ens10\n10.0.2.1",shape=Mrecord];
        }
      }

      subgraph cluster_nginx_subnet {
        label="NGINX Subnet\n10.0.1.0/24";

        subgraph cluster_nginx0 {
          label="NGINX0\n(nbg1-dc3)";
          nginx0 [label="<eth0> eth0\n116.203.201.188|<ens10> ens10\n10.0.1.1\n10.0.1.2",shape=Mrecord];
        }

        subgraph cluster_nginx1 {
          label="NGINX1\n(fsn1-dc14)";
          nginx1 [label="<eth0> eth0\n159.69.190.43|<ens10> ens10\n10.0.1.1\n10.0.1.3",shape=Mrecord];
        }
      }
    }

    edge [dir=both];
    test:ens10 -> gateway;
    nginx0:ens10 -> gateway;
    nginx1:ens10 -> gateway;
    test -> nginx0 -> nginx1 [style=invis]; // better gateway position
  }
graphviz1
-->

We will create 3 servers (`cx11` enough for us here), one with IP `10.0.2.0` we will use for sending HTTP requests to `10.0.1.1`. On two other servers where we will start nginx which will reply with server hostname. If one of them will go down other should re-assign ip `10.0.1.1` to itself and reply to HTTP requests. HTTP response of course will be changed.

I created Terraform code, so all this can be easily created with few commands (do not forget change Hetzner API Token and SSH key in [tf/variables.tf](tf/variables.tf)!):

```bash
terraform init
terraform apply
```

After apply, you should see nearly such output:

```bash
Apply complete! Resources: 10 added, 0 changed, 0 destroyed.

Outputs:

ip4_map = {
  "10.0.1.2" = "116.203.202.19"
  "10.0.1.3" = "159.69.190.43"
  "10.0.2.1" = "116.203.201.188"
}
nginx0_cmd = hcloud server change-alias-ips --network 7578 --clear 3080230 && hcloud server change-alias-ips --network 7578 --alias-ips 10.0.1.1 3080229
nginx1_cmd = hcloud server change-alias-ips --network 7578 --clear 3080229 && hcloud server change-alias-ips --network 7578 --alias-ips 10.0.1.1 3080230
```

Here you can see public IP address for connecting through SSH. Next two lines are commands which we will need use later, right now just save them.

### Keepalived

For creating failover IP we will use [keepalived](https://www.keepalived.org/).

On both nginx servers (`10.0.1.2` & `10.0.1.3`) we need do almost identical actions:

1) Install [nginx](https://nginx.org/) and `keepalived`:

```bash
apt install -y nginx keepalived
```

and save `hostname` to `index.html`:

```bash
hostname > /var/www/html/index.html
```

2) Install [hcloud](https://github.com/hetznercloud/cli):

`hcloud` is command-line tool for Hetzner Cloud. Problem is that servers not choose IP's ourself, instead we assign IP's through API and then Hetzner Cloud attach network interface to VM where OS start DHCP client which ask about IP and receive which we assigned. We also can add alias IP's, but they need to be added manually (`ip address add 10.0.1.1 ens10`). So, if we want floating IP in Hetzner Private Network we need set IP to each server and add alias which can be assigned only to one server. If server with aliased IP will go down we need automatically re-assign alias to another server and for this we will use `hcloud`. Unfortunately for this we need we need use Hetzner API Token.

```bash
curl --location --silent --output - https://github.com/hetznercloud/cli/releases/download/v1.13.0/hcloud-linux-amd64-v1.13.0.tar.gz | tar -zxO hcloud-linux-amd64-v1.13.0/bin/hcloud > /usr/local/bin/hcloud
chmod +x /usr/local/bin/hcloud

vim /etc/keepalived/ens10-ip.sh
chmod 700 /etc/keepalived/ens10-ip.sh
```

I added example with `vim` because if we run command which add content to script, this will be stored in `~/.bashrc` some time. It's also important set permission `700`, because only `root` should have access to this script due to Token.

Content for `nginx0`:

```bash
export HCLOUD_TOKEN=xKUf7qJRrGUNKmDsn5RgrfXt2xgy90rSOhElVGZm18tx3nhTYCqgLVwIHR0mKn0y
hcloud server change-alias-ips --network 7578 --clear 3080230 && hcloud server change-alias-ips --network 7578 --alias-ips 10.0.1.1 3080229
```

Content for `nginx1`:

```bash
export HCLOUD_TOKEN=xKUf7qJRrGUNKmDsn5RgrfXt2xgy90rSOhElVGZm18tx3nhTYCqgLVwIHR0mKn0y
hcloud server change-alias-ips --network 7578 --clear 3080229 && hcloud server change-alias-ips --network 7578 --alias-ips 10.0.1.1 3080230
```

For server with hostname `nginx0` we need `nginx0_cmd` from Terraform output, for `nginx1` — `nginx1_cmd`.

What this commands do? First command remove all alias IP's from another server and second add alias IP to current server. This commands are same except vice versa `Server ID` which placed at the end of each command.

3) Add configuration for `keepalived`:

`/etc/keepalived/keepalived.conf`:

```bash
global_defs {
  script_user root
  enable_script_security
}

vrrp_script chk_nginx {
  script "/usr/bin/killall -0 nginx"
  interval 1
  timeout 1
  rise 1
  fall 2
}

vrrp_instance hetzner {
  state                   BACKUP
  interface               ens10
  track_interface {
    ens10
  }
  track_script {
    chk_nginx
  }
  unicast_peer {
    10.0.1.2
    10.0.1.3
  }
  virtual_router_id       42
  priority                100
  virtual_ipaddress {
    10.0.1.1/32 dev ens10
  }
  nopreempt
  notify_master /etc/keepalived/ens10-ip.sh
}
```

Config is same for both servers, `unicast_peer` used because I did not figured out how make multicast work in Hetzner Private Network :confused: (If you know, please let me know!).

I decide not create different config (`MASTER` state sv `BACKUP` state) because I think that nodes should be equal. In current config only one server will be `MASTER` in the end. Important thing here that when server came `MASTER`, `keepalived` call our script which re-assign alias IP to this server.

We also need edit `keepalived.service` because on system startup `keepalived` start before `ens10` will be created, which cause `keepalived` stop.

`systemctl edit keepalived.service`:

```bash
[Unit]
After=hc-net-ifup@ens10.service

[Service]
ExecStartPre=/bin/sleep 5
```

Now we can enable and start `keepalived`: `systemctl enable keepalived.service --now`.

### Testing

For testing you need SSH to testing server (`10.0.2.1`). Since we just launched `keepalived` IP `10.0.1.1` should be assigned to some node (it's obviously will be node where `keepalived` started earlier):

```bash
curl 10.0.1.1
> nginx0
```

Now we can reboot `nginx0` server (or shutdown `keepalived` / `nginx`) and IP will be assigned to `nginx1`:

```bash
curl 10.0.1.1
> nginx1
```

It's really cool things!
