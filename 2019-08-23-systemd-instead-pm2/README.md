# systemd instead pm2?

Few years ago when I need run my apps on servers I found [pm2](http://pm2.keymetrics.io/). This is really cool tool, everything what you need is just install [Node.js](https://nodejs.org/) and then pm2 with [npm](https://www.npmjs.com/). It's handy start / stop / restart programs, logs from stdout/stderr going to files and pm2 have modules for log-rotation. You also can define [Ecosystem File](http://pm2.keymetrics.io/docs/usage/application-declaration/) where describe environment variables and other things. In past for deployment new version I logged through SSH to server, fetched new code to local repo with SSH agent forwarding (I'm sorry about that, never repeat my mistake, agent forwardning is not safe!) and restarted service. All fine, while you project is not big.

Now in containers era we run our services in containers which managed by different systems, from simple [docker-compose](https://docs.docker.com/compose/compose-file/) to omnipotent [Kubernetes](https://kubernetes.io/). Logs forwarded by programs like [Fluent Bit](https://fluentbit.io/) to [Elastic Stack](https://www.elastic.co/products/elastic-stack). Do we really pm2 now? I'm think not.

But what if you need run some services which are not good for containers? Maybe services have big performance degradation or you do not want to deal with state in containers? Do we still need pm2 for this? I still think not, because much better use [systemd](https://www.freedesktop.org/wiki/Software/systemd/) for this.

`systemd` is not simple, there a lot of docs, some helpful pages:

  - list of all `systemd` manpages — https://www.freedesktop.org/software/systemd/man/
  - `journal`:
    - `journalctl`: https://www.freedesktop.org/software/systemd/man/journalctl.html
    - `journald.conf`: https://www.freedesktop.org/software/systemd/man/journald.conf.html
    - `systemd-journald.service`: https://www.freedesktop.org/software/systemd/man/systemd-journald.service.html
  - `systemctl`: https://www.freedesktop.org/software/systemd/man/systemctl.html
  - `systemd`: https://www.freedesktop.org/software/systemd/man/systemd.html
  - `systemd.exec`: https://www.freedesktop.org/software/systemd/man/systemd.exec.html
  - `systemd.kill`: https://www.freedesktop.org/software/systemd/man/systemd.kill.html
  - `systemd.resource-usage`: https://www.freedesktop.org/software/systemd/man/systemd.resource-control.html
  - `systemd.unit`: https://www.freedesktop.org/software/systemd/man/systemd.unit.html
  - `systemd.service`: https://www.freedesktop.org/software/systemd/man/systemd.service.html

Example of [Bitcoin Core](https://github.com/bitcoin/bitcoin/) service (see [bitcoind.service](https://github.com/bitcoin/bitcoin/blob/master/contrib/init/bitcoind.service)):

`systemd` loading units from few directories, but if we create unit we should put it to `/etc/systemd/system/` ([systemd.unit](https://www.freedesktop.org/software/systemd/man/systemd.unit.html) see `Table 1`).

```bash
cat > /etc/systemd/system/bitcoind.service <<EOF
[Unit]
Description=Bitcoin Daemon
Documentation=https://github.com/bitcoin/bitcoin/
After=network.target
ConditionArchitecture=x86-64
ConditionFileIsExecutable=/usr/local/bin/bitcoind
; systemd >= 242
; ConditionMemory=>=512M
; ConditionCPUs=>=1

[Service]
Type=simple
ExecStart=/usr/local/bin/bitcoind \
                                  -datadir=/var/lib/bitcoind \
                                  -txindex \
                                  -disablewallet \
                                  -printtoconsole \
                                  -server \
                                  -rpcuser=bitcoinrpc \
                                  -rpcpassword=password \
                                  -rpcport=8332 \
                                  -zmqpubhashtx=tcp://127.0.0.1:28332 \
                                  -rest
User=ubuntu
Group=ubuntu
KillMode=process
KillSignal=SIGTERM
TimeoutStopSec=30s
Restart=on-failure
# /var/lib/bitcoind
StateDirectory=bitcoind
StateDirectoryMode=0710

[Install]
WantedBy=multi-user.target
EOF
```

Optionally we can control resource usage with [systemd.resource-control](https://www.freedesktop.org/software/systemd/man/systemd.resource-control.html), by adding options to `[Service]`:

```bash
[Service]
CPUAccounting=1
CPUQuota=100%
MemoryAccounting=1
MemoryMax=300M
MemorySwapMax=0
LimitRSS=300M
LimitAS=500M
```

Before we will able use our service we need reload configuration:

```bash
systemctl daemon-reload
systemctl enable bitcoind.service --now
```

Logs can be read with `journalctl`:

```bash
journalctl -feu bitcoind
```
