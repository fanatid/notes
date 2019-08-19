# Kubernetes setup with kubeadm

This note is only summary of [kubeadm referece](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm/) and [kubeadm getting started](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/). While I experimented with [Kubernetes](https://kubernetes.io/) I had never run any software for some “production” use there. This note mostly created for myself as short document about setup process. Any advices about kubernetes are highly appreciated (email/issue/etc).

  - [What is kubeadm?](what-is-kubeadm)
  - [Infrastructure](#infrastructure)
  - [HAProxy](#haproxy)
  - [Before we run kubeadm init / join](#before-we-run-kubeadm-init--join)
  - [kubeadm init](#kubeadm-init)
  - [kubeadm join](#kubeadm-join)
    - [Control planes](#control-planes)
    - [Worker nodes](#worker-nodes)
  - [Usage](#usage)

### What is kubeadm?

From docs:

  > Kubeadm is a tool built to provide **kubeadm init** and **kubeadm join** as best-practice “fast paths” for creating Kubernetes clusters.

As alternative you can use managed kubernetes, like [Amazon EKS](https://aws.amazon.com/eks/), [Google Kubernetes Engine](https://cloud.google.com/kubernetes-engine/) or [search it in google](http://www.google.com/search?q=managed+kubernetes).

If you want install your own you also can use [kubespray](https://kubespray.io/) (set of Ansible roles), but now `kubespray` uses `kubeamd` under the hood itself.

### Infrastructure

We will setup HA Kubernetes with stacked etcd, like [docs/kubeadm/ha-topology](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/ha-topology/#stacked-etcd-topology).

While control plane nodes and worker nodes have few instances on proposed scheme, load balancer only one, this means that this unit can be point of failure. You need use cloud load balancer which provide HA features or you can build own, as exemple you can check my note [Internal failover IP in Hetzner Cloud](https://github.com/fanatid/notes/tree/master/2019-08-06-hetzner-cloud-internal-failover-ip). Here we will use single [HAProxy](https://www.haproxy.com/) instance as load balancer. It's also possible remove load balaner from scheme and use `keepalived` as load balaner located on control plane nodes (see note [Virtual Server with keepalived](https://github.com/fanatid/notes/tree/master/2019-08-18-virtual-server-with-keepalived)).

Defined subnets and servers:

  - `10.0.1.0/24` subnet for control plane nodes and load balancer. `cx11`: `10.0.1.1` / `cx31`: `10.0.1.2`, `10.0.1.3`, `10.0.1.4`
  - `10.0.2.0/24` subnet for worker nodes. `cx31`: `10.0.2.1`, `10.0.2.2`

I created Terraform code, so all this can be easily created with few commands (do not forget change Hetzner API Token and SSH key in [tf/variables.tf](tf/variables.tf)):

```bash
terraform init
terraform apply
```

After apply, you should see nearly such output:

```bash
master_ipv4 = {
  "10.0.1.2" = "159.69.245.224"
  "10.0.1.3" = "159.69.245.228"
  "10.0.1.4" = "159.69.247.119"
}
master_loadbalancer_ipv4 = 10.0.1.1 => 159.69.246.29
worker_ipv4 = {
  "10.0.2.1" = "159.69.181.104"
  "10.0.2.2" = "159.69.247.111"
}
```

Result of `terraform apply` is map of private addresses to public addresses for connecting through SSH. In production all connections to public addresses should be rejected and you should connect to servers through VPN (see [WireGuard setup guide](https://github.com/fanatid/notes/tree/master/2019-07-28-wireguard-setup-guide) as example of secure tunnel to VPN). If it's possible it even better not assign public address to servers, if they not require it, at all.

### HAProxy

Before we start setup control plance we should setup load balancer. First we need add repository with latest haproxy and install it:

```bash
apt-get install -y software-properties-common
add-apt-repository ppa:vbernat/haproxy-2.0
apt-get update
apt-get install -y haproxy=2.0.\*
```

Put config to `/etc/haproxy/haproxy.cfg`:

```
global
  user haproxy
  group haproxy
  daemon
  chroot /var/lib/haproxy

defaults
  mode    tcp
  balance roundrobin
  timeout client      30s
  timeout server      30s
  timeout connect      3s

frontend front
  bind 10.0.1.1:6443
  default_backend kubeapis

backend kubeapis
  default-server fall 2 check
  server api1 10.0.1.2:6443
  server api2 10.0.1.3:6443
  server api3 10.0.1.4:6443
```

And restart service:

```bash
systemctl restart haproxy.service
```

### Before we run kubeadm init / join

Before we run `kubeadm init` we need must make sure that required ports are opened and we install and configure required software. This equal for master and worker nodes.

Required ports for kubernetes described in docs: https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/#check-required-ports

Software & configs:

1) Dependencies

Packages which we will need in the future:

```bash
apt-get update
apt-get install -y apt-transport-https curl software-properties-common ca-certificates gnupg-agent
```

2) Containers runtime

Currently not only [docker](https://www.docker.com/) can be used as container runtime. More over, `docker` itself uses [containerd](https://containerd.io/) which can be used directly by Kubernetes. But still, currently probably still better install docker because it's provide cli tool for image/container/etc management on node. See [container-runtimes on kubernetes.io/docs](https://kubernetes.io/docs/setup/production-environment/container-runtimes) for details.

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
apt-get install -y docker-ce=5:18.09.8~3-0~ubuntu-bionic
apt-mark hold docker-ce

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
```

3) `kubeadm`, `kubelet`, `kubectl` ([docs](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/#installing-kubeadm-kubelet-and-kubectl))

```bash
curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add -
add-apt-repository "deb https://apt.kubernetes.io/ kubernetes-xenial main"
apt-get update
apt-get install -y kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl
```

Autocompletion for `kubeadm` and `kubectl` can be added by:

```bash
echo "which kubeadm 1>/dev/null 2>&1 && source <(kubeadm completion bash)" >> ~/.bashrc
echo "which kubectl 1>/dev/null 2>&1 && source <(kubectl completion bash)" >> ~/.bashrc
```

### kubeadm init

Now we can initialize our cluster (on master0 with ip `10.0.1.2`):

```bash
kubeadm init --upload-certs --config ./cluster.yaml
```

where `./cluster.yaml` (see config docs on [godoc (kubeadm.k8s.io/v1beta2)](https://godoc.org/k8s.io/kubernetes/cmd/kubeadm/app/apis/kubeadm/v1beta2), kubelet [options doc](https://kubernetes.io/docs/reference/command-line-tools-reference/kubelet/#options)):

```yaml
apiVersion: kubeadm.k8s.io/v1beta2
kind: InitConfiguration
localAPIEndpoint:
  advertiseAddress: 10.0.1.2
nodeRegistration:
  kubeletExtraArgs:
    node-ip: 10.0.1.2
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
```

And you should see something like this:

```bash
Your Kubernetes control-plane has initialized successfully!

To start using your cluster, you need to run the following as a regular user:

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config

You should now deploy a pod network to the cluster.
Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:
  https://kubernetes.io/docs/concepts/cluster-administration/addons/

You can now join any number of the control-plane node running the following command on each as root:

  kubeadm join 10.0.1.1:6443 --token 31u0w5.ux6jqv4bo27pft48 \
    --discovery-token-ca-cert-hash sha256:a405181b40ab0e921ff84437b536c82ac73fa4743f4f957dcb87538dd8766eaa \
    --control-plane --certificate-key 3de61095e22d8ffc98c52ad3e16d566d465975a6a15d584ab8e43ce751fc56d9
```

Now, after copying config to `$HOME/.kube/config`, we can setup network. With [flannel](https://github.com/coreos/flannel/) this will be command:

```bash
curl -s -o - https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml | sed '/- --ip-masq$/i\        - --iface-regex=10\\..*' | kubectl apply -f -
```

we add `--iface-regex` for selecting our private network for communication instead public.

### kubeadm join

##### Control planes

For control planes we should define config file and run `kubeadm join --config ./cluster.yaml`:

(before you run `join` command, you need change node ip, certificate key, token and certificate hash to what you received on `kubeadm init` stage)

```yaml
apiVersion: kubeadm.k8s.io/v1beta2
kind: JoinConfiguration
controlPlane:
  localAPIEndpoint:
    advertiseAddress: 10.0.1.3
  certificateKey: 3de61095e22d8ffc98c52ad3e16d566d465975a6a15d584ab8e43ce751fc56d9
nodeRegistration:
  kubeletExtraArgs:
    node-ip: 10.0.1.3
discovery:
  bootstrapToken:
    apiServerEndpoint: 10.0.1.1:6443
    token: 31u0w5.ux6jqv4bo27pft48
    caCertHashes:
    - sha256:a405181b40ab0e921ff84437b536c82ac73fa4743f4f957dcb87538dd8766eaa
```

Same on third master, except that ip should be changed to `10.0.1.4`.

##### Worker nodes

Workers will have same config for `kubeadm join` as control planes, except that we should remove key `controlPlane`:

```yaml
apiVersion: kubeadm.k8s.io/v1beta2
kind: JoinConfiguration
nodeRegistration:
  kubeletExtraArgs:
    node-ip: 10.0.2.1
discovery:
  bootstrapToken:
    apiServerEndpoint: 10.0.1.1:6443
    token: 31u0w5.ux6jqv4bo27pft48
    caCertHashes:
    - sha256:a405181b40ab0e921ff84437b536c82ac73fa4743f4f957dcb87538dd8766eaa
```

And same on second worker node, but with changed `node-ip` to `10.0.2.2`.

### Usage

After successful joining masters and worker nodes, you should able to see all connected nodes to cluster:

```bash
$ kubectl get nodes -o wide
NAME      STATUS   ROLES    AGE     VERSION   INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION      CONTAINER-RUNTIME
master0   Ready    master   6m18s   v1.15.2   10.0.1.2      <none>        Ubuntu 18.04.3 LTS   4.15.0-58-generic   docker://18.9.8
master1   Ready    master   3m41s   v1.15.2   10.0.1.3      <none>        Ubuntu 18.04.3 LTS   4.15.0-58-generic   docker://18.9.8
master2   Ready    master   2m40s   v1.15.2   10.0.1.4      <none>        Ubuntu 18.04.3 LTS   4.15.0-58-generic   docker://18.9.8
worker0   Ready    <none>   62s     v1.15.2   10.0.2.1      <none>        Ubuntu 18.04.3 LTS   4.15.0-58-generic   docker://18.9.8
worker1   Ready    <none>   17s     v1.15.2   10.0.2.2      <none>        Ubuntu 18.04.3 LTS   4.15.0-58-generic   docker://18.9.8
```

Now we can start simple deployment with service:

```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whoami
spec:
  replicas: 2
  selector:
    matchLabels:
      app: whoami
  template:
    metadata:
      labels:
        app: whoami
    spec:
      containers:
      - name: whoami
        image: containous/whoami
---
apiVersion: v1
kind: Service
metadata:
  name: whoami
spec:
  type: ClusterIP
  ports:
    - port: 80
      name: whoami
  selector:
    app: whoami
EOF
```

and receive response from this service:

```bash
$ kubectl get svc whoami
NAME     TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
whoami   ClusterIP   10.111.57.63   <none>        80/TCP    51s
$ curl 10.111.57.63
Hostname: whoami-6c79b8c8d-wd2b5
IP: 127.0.0.1
IP: 10.244.4.2
GET / HTTP/1.1
Host: 10.111.57.63
User-Agent: curl/7.58.0
Accept: */*
```
