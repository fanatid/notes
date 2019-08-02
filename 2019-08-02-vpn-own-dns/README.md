# Own DNS in VPN

### DNS

For what we need DNS in our VPN? Well, if we have 1 service we can easily remember (or note) IP address and use it. More over, because we can assign IP by ourself, it's can be persistent. But what if we have dozen services, few users and services can change their IP's? What if we need add simple load balancing for our services based on DNS? All this can be solved if we will use own DNS service.

In this note I'll show how do this with [CoreDNS](https://coredns.io/). Why CoreDNS? Because configuration is very simple, project supported by [CNCF](https://www.cncf.io/) and used by default in [Kubernetes](https://kubernetes.io/).

### Secure tunnel

[WireGuard](https://www.wireguard.com/) will be used for secure tunnel to our VPN, you should setup it as I described in guide: [WireGuard setup guide](../2019-07-28-wireguard-setup-guide).

### CoreDNS on server

For automated installtion and configuration CoreDNS on server I created 2 [Ansible](https://www.ansible.com/) roles:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook ./coredns-install.yml ./coredns-config.yml -e 'target=dns coredns=1.6.1 coredns_profile=default'
```

What's this roles do?

  - [coredns-install](ansible/roles/coredns-install)

    - install required CoreDNS version (if `latest` set, then role will download latest version)
    - disable port `53` binding by `systemd-resolved` in `/etc/systemd/resolved.conf` and restart `systemd-resolved`
    - create user `coredns`
    - upload [CoreDNS config](ansible/roles/coredns-install/files/Corefile) to `/etc/coredns/Corefile`
    - upload [system resolve](ansible/roles/coredns-install/files/resolv.conf) config to `/etc/resolv.conf`
    - upload [unit file](ansible/roles/coredns-install/files/coredns.service) for systemd service to `/etc/systemd/system` (see [coredns/deployment:systemd](https://github.com/coredns/deployment/tree/master/systemd))
    - start and active coredns service if CoreDNS was installed
    - restart coredns service if CoreDNS was updated

    What uploaded Corefile inclue?

      - [errors](https://coredns.io/plugins/errors/)
      - [forward](https://coredns.io/plugins/forward/) (to `213.133.100.100 213.133.98.98 213.133.99.99`, see [Hetzner DNS](https://wiki.hetzner.de/index.php/Hetzner_Standard_Name_Server/en))
      - [cache](https://coredns.io/plugins/cache/)
      - [loop](https://coredns.io/plugins/loop/)
      - [reload](https://coredns.io/plugins/reload/) with minimal available reload interval 2s

  - [coredns-config](ansible/roles/coredns-config)

    - upload selected CoreDNS profile and his files

I also added zone `example.com` to default profile for demonstration.

### Local setup

Now our DNS service working and we can check it, with `dig` for example:

```bash
$ dig +nocmd @116.203.89.18 -p 53 a.example.com +noall +answer
a.example.com.    5 IN  A 10.0.3.1
```

and if `log` plugin is set in your config, you can see logs by typing `journalctl -feu coredns` on `10.0.2.1`:

```bash
2019-08-02T16:47:04.525+02:00 [INFO] 78.81.187.109:35894 - 26238 "A IN a.example.com. udp 54 false 4096" NOERROR qr,aa,rd 60 0.000212109s
```

But we should configure DNS locally somehow for use our DNS in VPN only for domain `example.com`. It's not right if everything (or not required part) will be resolved through our DNS in VPN, because in this case you will disclosure everything what visited to anybody who can have read access to logs of our DNS in VPN.

If you use [NetworkManager](https://wiki.gnome.org/Projects/NetworkManager) you should disable DNS configuration. For this add next 3 options to `[main]` section to NetworkManager config, located at: `/etc/NetworkManager/NetworkManager.conf`.

```ini
[main]
dns=none
rc-manager=unmanaged
systemd-resolved=false
```

and you should restart NetworkManager: `systemctl restart NetworkManager`.

Next we need to be sure that all DNS requests go through service [systemd-resolved](https://www.freedesktop.org/software/systemd/man/systemd-resolved.service.html). For this we should make `/etc/resolv.conf` as link which will be point to stub file from `systemd-resolved`:

```bash
ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
```

Now we should change `PostUp` command in our `WireGuard` config for `systemd-resolved` configuration:

```bash
PostUp = wg set %i private-key <(cat /etc/wireguard/%i.conf.privatekey) && resolvectl dnssec %i no && resolvectl domain %i ~example.com && resolvectl dns %i 10.0.2.1
```

here we disable DNSSEC, set domain for names resolution and set address of our DNS server. This commands described in man for [resolvectl](https://www.freedesktop.org/software/systemd/man/resolvectl.html).

Now only `*example.com` will be resolved through `10.0.2.1`, everything rest will be resolved through DNS servers which set in `systemd-resolved` by default or by you.

\* If you want DNSSEC support, you need add plugin [dnssec](https://coredns.io/plugins/dnssec/) to CoreDNS config and generate keys for zone, but this is not really required since DNS traffic to our server going through secure tunnel.

### Default DNS in systemd-resolved

By default `systemd-resolved` have `FallbackDNS` set to `8.8.8.8 8.8.4.4 2001:4860:4860::8888 2001:4860:4860::8844`. If you want set own DNS by default, you need:

  - Set value for `DNS` in `/etc/systemd/resolved.conf`
  - Restart `systemd-resolved`: `systemctl restart systemd-resolved.service`

Options description on [freedesktop.org](https://www.freedesktop.org): https://www.freedesktop.org/software/systemd/man/resolved.conf.html

### Possible future topipcs

  - High Availability with [etcd](https://etcd.io/)
