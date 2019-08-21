# CoreDNS tune for external domains in Kubernetes

  - [Pod for tests](#pod-for-tests)
  - [Problem first](#problem-first)
  - [Solution](#solution)
  - [Resources](#resources)

In this note we will need [Kubernetes](https://kubernetes.io/) cluster for experiments, you can check previous note [Kubernetes setup with kubeadm](https://github.com/fanatid/notes/tree/master/2019-08-19-kubernetes-setup-with-kubeadm), or

<details>
<summary>use small summary note for installing kubernetes on one machine</summary>

```bash
# Close ports with iptables
apt install -y python iptables-persistent

iptables -A INPUT -i eth0 -p tcp --dport 22 -j ACCEPT                          # Allow SSH
iptables -A INPUT -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT # Allow ESTABLISHED
iptables -A INPUT -i eth0 -p icmp -j ACCEPT                                    # Allow ICMP
iptables -A INPUT -i eth0 -j REJECT                                            # Reject rest
iptables-save > /etc/iptables/rules.v4                                         # Save ipv4 rules

ip6tables -A INPUT -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT # Allow ESTABLISHED
ip6tables -A INPUT -i eth0 -p icmpv6 -j ACCEPT                                  # Allow ICMP
ip6tables -A INPUT -i eth0 -j REJECT                                            # Reject rest
ip6tables-save > /etc/iptables/rules.v6                                         # Save ipv6 rules

# Install CRI (Docker)
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
apt-get install -y docker-ce=5:18.09.8~3-0~ubuntu-bionic
apt-mark hold docker-ce

# Change Docker config and restart it
cat > /etc/docker/daemon.json <<EOF
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m"
  },
  "storage-driver": "overlay2",
  "iptables": false
}
EOF
systemctl restart docker

# Install kube binaries
curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add -
add-apt-repository "deb https://apt.kubernetes.io/ kubernetes-xenial main"
apt-get update
apt-get install -y kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl

# Add auto completion to cli
which kubeadm 1>/dev/null 2>&1 && source <(kubeadm completion bash) && echo "which kubeadm 1>/dev/null 2>&1 && source <(kubeadm completion bash)" >> ~/.bashrc
which kubectl 1>/dev/null 2>&1 && source <(kubectl completion bash) && echo "which kubectl 1>/dev/null 2>&1 && source <(kubectl completion bash)" >> ~/.bashrc

# Create config for kubeadm init
cat >./cluster.yaml <<EOF
apiVersion: kubeadm.k8s.io/v1beta2
kind: InitConfiguration
localAPIEndpoint:
  advertiseAddress: 10.0.1.1
nodeRegistration:
  taints: []
  kubeletExtraArgs:
    node-ip: 10.0.1.1
---
apiVersion: kubeadm.k8s.io/v1beta2
kind: ClusterConfiguration
kubernetesVersion: stable
controlPlaneEndpoint: 10.0.1.1:6443
apiServer:
  extraArgs:
    advertise-address: 10.0.1.1
controllerManager:
  extraArgs:
    allocate-node-cidrs: "true"
    cluster-cidr: 10.244.0.0/16
EOF

# Initialize cluster
kubeadm init --upload-certs --config=./cluster.yaml

# Copy kube-config
mkdir -p $HOME/.kube
cp /etc/kubernetes/admin.conf $HOME/.kube/config
chown $(id -u):$(id -g) $HOME/.kube/config

# Initialize network
curl -s -o - https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml | sed '/- --ip-masq$/i\        - --iface-regex=10\\..*' | kubectl apply -f -
```

</details>

### Pod for tests

For testing DNS in pods I propose use [infoblox/dnstools](https://hub.docker.com/r/infoblox/dnstools) container:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: dnstools
spec:
  containers:
  - name: dnstools
    image: infoblox/dnstools
    command: ['sh', '-c', 'while true; do sleep 1; done']
EOF
```

### Problem first

Let's dump UDP packets on port 53, for this we connect to pod and run [tcpdump](https://www.tcpdump.org/):

```bash
$ kubectl exec -it dnstools sh
dnstools# tcpdump -ni eth0 udp and port 53
```

In second instance of TTY we ask about `A` record of `google.com`:

```bash
$ kubectl exec -it dnstools sh
dnstools# dig google.com +search A
...
;; ANSWER SECTION:
google.com.   30  IN  A 216.58.205.238
...
```

We reiceve `A` record, DNS works. But in same time in first TTY instance `tcpdump` show that 4 packets was sent:

```bash
18:44:10.554004 IP 10.244.0.24.59479 > 10.96.0.10.53: 51855+ [1au] A? google.com.default.svc.cluster.local. (77)
18:44:10.554605 IP 10.96.0.10.53 > 10.244.0.24.59479: 51855 NXDomain*- 0/1/1 (170)
18:44:10.555325 IP 10.244.0.24.33612 > 10.96.0.10.53: 60060+ [1au] A? google.com.svc.cluster.local. (69)
18:44:10.555674 IP 10.96.0.10.53 > 10.244.0.24.33612: 60060 NXDomain*- 0/1/1 (162)
18:44:10.556033 IP 10.244.0.24.48711 > 10.96.0.10.53: 56924+ [1au] A? google.com.cluster.local. (65)
18:44:10.556304 IP 10.96.0.10.53 > 10.244.0.24.48711: 56924 NXDomain*- 0/1/1 (158)
18:44:10.556611 IP 10.244.0.24.59575 > 10.96.0.10.53: 39260+ [1au] A? google.com. (51)
18:44:10.556851 IP 10.96.0.10.53 > 10.244.0.24.59575: 39260 1/0/1 A 216.58.205.238 (77)
```

Why? Because if you check `/etc/resolf.conf`, you will find:

```bash
nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

`ndots:5` is important here, from [resolf.conf man page](https://linux.die.net/man/5/resolv.conf):

> ndots:n
>
> sets a threshold for the number of dots which must appear in a name given to res_query(3) (see resolver(3)) before an initial absolute query will be made. The default for n is 1, meaning that if there are any dots in a name, the name will be tried first as an absolute name before any search list elements are appended to it. The value for this option is silently capped to 15.

what means that if name contains less than 5 dots, then local domains will be used first:

```bash
google.com.default.svc.cluster.local. -> NXDOMAIN
google.com.svc.cluster.local. -> NXDOMAIN
google.com.cluster.local. -> NXDOMAIN
google.com. -> A
```

If you have a lot of outside traffic that means that every resolve query will produce 4 DNS queries instead 1 (or 8 vs 2 in case both IPv4 & IPv6).

### Solution

If you want solve it only for specified pod, you can define `dnsConfig` in pod spec: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/#pod-s-dns-config

But better solve it on [CoreDNS](https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/#coredns) level, because it's also improve records validations for pods.

For changing CoreDNS config we need change ConfigMap:

```bash
kubectl edit -n kube-system configmap coredns
```

and change `Corefile`:

  - Add `autopath @kubernetes`. `autopath` will follow the chain of search path elements and return the first reply that is not NXDOMAIN.
  - Change `pods` in `kubernetes` to `verified` instead `insecure`. In this case CoreDNS will track all existed pods. `insecure` used by default for backward compatibility with [kube-dns](https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/#kube-dns).

Because `Corefile` add plugin [reload](https://coredns.io/plugins/reload/) `CoreDNS` in pods will reload config itself (by default interval 30s with jitter 15s).

After reloading (you can track this with command like: `kubectl logs -n kube-system -f coredns-5c98db65d4-fv2jt`):

```bash
dnstools# dig google.com +search A
...
;; ANSWER SECTION:
google.com.default.svc.cluster.local. 30 IN CNAME google.com.
google.com.   30  IN  A 216.58.205.238
...
```

and `tcpdump` show only 1 DNS query:

```bash
18:48:27.643399 IP 10.244.0.24.47595 > 10.96.0.10.53: 45594+ [1au] A? google.com.default.svc.cluster.local. (77)
18:48:27.643759 IP 10.96.0.10.53 > 10.244.0.24.47595: 45594 2/0/1 CNAME google.com., A 216.58.205.238 (163)
```

### Resources

  - `CoreDNS GA for Kubernetes Cluster DNS`: https://kubernetes.io/blog/2018/07/10/coredns-ga-for-kubernetes-cluster-dns/
  - `Customizing DNS Service`: https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/
  - `Configuring Private DNS Zones and Upstream Nameservers in Kubernetes`: https://kubernetes.io/blog/2017/04/configuring-private-dns-zones-upstream-nameservers-kubernetes/
  - `DNS for Services and Pods`: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/
  - `Custom DNS Entries For Kubernetes`: https://coredns.io/2017/05/08/custom-dns-entries-for-kubernetes/
  - `CoreDNS, plugin kubernetes`: https://coredns.io/plugins/kubernetes/
  - `CoreDNS, plugin autopath`: https://coredns.io/plugins/autopath/
  - `infoblox/dnstools`: https://hub.docker.com/r/infoblox/dnstools
