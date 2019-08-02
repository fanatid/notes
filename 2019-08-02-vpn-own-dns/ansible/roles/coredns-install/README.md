## coredns-install

Install [CoreDNS](https://coredns.io/), create simple config and run as systemd service.

### usage

```bash
ansible-playbook -i 'root@X.X.X.X,' ./coredns-install.yml -e 'target=all coredns=1.6.1'
```

It's possible set `coredns` to `latest`, in this case latest avaiable release will be downloaded.
