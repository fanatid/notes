## coredns-config

Upload CoreDNS config and required files.

### usage

```bash
ansible-playbook -i 'root@X.X.X.X,' ./coredns-install.yml -e 'target=all coredns_profile=default'
```

`coredns_profile` is `default` by default.
