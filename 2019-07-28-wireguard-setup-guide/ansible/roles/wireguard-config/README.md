## wireguard-config

- Create [WireGuard](https://www.wireguard.com/) Keys if they not exists.
- Update WireGuard configuration for peers from vars.
- Add new / remove outdated peers from current interface.
- Print WireGuard Server Public Key.

### usage

Additional to playbook `target` variable, 2 extra variables for role should be defined:

  - `wg_host` -- name of wireguard vars / template
  - `wg_name` -- name of wireguard interface on host machine

```bash
ansible-playbook -i 'root@X.X.X.X,' ./wireguard-config.yml -e 'target=all wg_host=example wg_name=wg0'
```
