## sshd

Upload sshd config with disabled password-based authentication.

### usage

```bash
ansible-playbook -i ./inventory/hosts.yml ./sshd.yml -e 'target=all'
```
