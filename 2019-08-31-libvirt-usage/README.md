# Virtual Machines with libvirt

In containers era it's can be strange to use Virtual Machines for running or testing something, but sometimes we need fully isolated environment because in such way we can reproduce some parts of production systems locally. Also, some software much easier test and debug in Virtual Machines.

  - [libvirt](#libvirt)
  - [setup](#setup)
    - [Tools](#tools)
    - [URI](#uri)
    - [Image](#image)
    - [ISO image for cloud-init](#iso-image-for-cloud-init)
    - [Creating VM](#creating-vm)
    - [Static IP](#static-ip)
    - [Destroy](#destroy)

### libvirt

[libvirt](https://libvirt.org/) is great because provide universal API which can work with different technologies. Usually KVM/QEMU is used.

`libvirtd` can be managed in diffent ways (see https://libvirt.org/apps.html). You can do a lot with GUI app [virt-manager](https://virt-manager.org/), and this probably is good choice if you need 1-2 machines without recreating them. In other case we need automate creation/updating/removing/etc of our VMs.

Nowadays a lot of Linux distros provide cloud images (for example [fedora](https://alt.fedoraproject.org/cloud/), [ubuntu](https://cloud-images.ubuntu.com/)). It's preferred way because you receive working OS out of box with installed [cloud-init](https://cloud-init.io/) services (for initial setup, like adding SSH-keys).

### Setup

##### Tools

Before we continue you should install `libvirt` itself, `virt-install` and `genisoimage` tools. Tools like `virsh` and `qemu-*` will be installed with `libvirt`. Problem with `virsh` (and why we need `virt-install`) that `virsh` works only with xml documents. It's not very comfortable works with xml for creating Virtual Machines, so we will use `virt-install`. You also need add yourself to `libvirt` group:

```bash
usermod -a -G libvirt $(whoami)
```

##### URI

Since `libvirt` support different kinds of virtualization we need to say which exactly one we want to use. `virsh` uses environment variable `LIBVIRT_DEFAULT_URI`, if this variable is not defined `qemu:///session` will be used for non-root users and `qemu:///system` for root user, so for using system mode we should define `LIBVIRT_DEFAULT_URI` (otherwise VM will have local user permissions). See [libvirt uri](https://libvirt.org/uri.html), [what is the difference between](https://wiki.libvirt.org/page/FAQ#What_is_the_difference_between_qemu:.2F.2F.2Fsystem_and_qemu:.2F.2F.2Fsession.3F_Which_one_should_I_use.3F), [explanation on KVM/QEMU page](https://libvirt.org/drvqemu.html#securitydac).

```bash
echo "export LIBVIRT_DEFAULT_URI=qemu:///system" >> ~/.bashrc
LIBVIRT_DEFAULT_URI=qemu:///system
```

##### Image

We will create Ubuntu 18.04 in our VM, let's download base image:

```bash
mkdir /var/lib/libvirt/images/base
curl -o /var/lib/libvirt/images/base/ubuntu18.04.qcow2 https://cloud-images.ubuntu.com/bionic/current/bionic-server-cloudimg-amd64.img
```

I created `base` directory in `/var/lib/libvirt/images`, but this is not necessary, you can use directory which available for you (`/var/lib/libvirt` require root access).

Now we will create image for our VM and resize it to 5G:

```bash
qemu-img create -f qcow2 -b /var/lib/libvirt/images/base/ubuntu18.04.qcow2 /var/lib/libvirt/images/test1.qcow2
qemu-img resize /var/lib/libvirt/images/test1.qcow2 5G
qemu-img info /var/lib/libvirt/images/test1.qcow2
```

```bash
image: /var/lib/libvirt/images/test1.qcow2
file format: qcow2
virtual size: 5.0G (5368709120 bytes)
disk size: 200K
cluster_size: 65536
backing file: /var/lib/libvirt/images/base/ubuntu18.04.qcow2
Format specific information:
    compat: 1.1
    lazy refcounts: false
    refcount bits: 16
    corrupt: false
```

When we create image with backing file we should not move/remove backing file in future, [qcow2](https://en.wikipedia.org/wiki/Qcow) works as copy-on-write layered file system. If you check size of created image you will find that file size less than 1MB.

We also can `convert` base image, so backing file will not be required:

```bash
qemu-img convert -f qcow2 -O qcow2 -c bionic-server-cloudimg-amd64.img ubuntu18.04.qcow2
```

If we will not use flag `-c` we will receive not compressed image: 1.1GB vs \~330MB.

We also can mount our image with `qemu-nbd` tool:

```bash
qemu-nbd -c /dev/nbd0 /var/lib/libvirt/images/test1.qcow2
```

and then mount device `/dev/nbd0p1` as usual with `mount` command.

##### ISO image for cloud-init

For initial setup in our VM we can use [cloud-init](https://cloud-init.io/) which already preinstalled. We will need two files:

1) Empty `meta-data`. For available options see: https://cloudinit.readthedocs.io/en/latest/topics/datasources.html

2) `user-data` with defined `hostname`, list of SSH-keys and new `sshd` config:

```bash
#cloud-config
hostname: test1

disable_root: false
ssh_authorized_keys:
  - ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDrN2DVTlDzXklIDAkvet62Ve5uQPNpCCc0EG9JjGBzpWGy80r1KLgJgas5xLJYGZaygfuxY6Iij3mZ3QHVbCa3XITjojR8v53jUGXQ0Ouo/D3VaBdRqeno7iJu6GsWKfVo15duf49f4AB98pj7BqXcHxj8xyxLSb2keUwvi7ugJb3KDpEjdWprajN92Uj/uT4PpDM5xrSRb1QVwXJ0XWz8TKZKlhH0xD3UWjLEhQjOk6PO31Dcip+k9waxyJGlmLy/c7Z8KA5gOzGbpN3q1phV4OPzKj6RlkJj0YY1Lvqt8aV4QqLfKFatBGL0+5GyEkckWUsJkXbmcaVbMvXU0Oqb fanatid@ya.ru

write_files:
  - path: /etc/ssh/sshd_config
    owner: root:root
    permissions: '0600'
    content: |
      AcceptEnv LANG LC_*
      ChallengeResponseAuthentication no
      PasswordAuthentication no
      PrintMotd no
      Subsystem sftp  /usr/lib/openssh/sftp-server
      UsePAM yes
      X11Forwarding yes

runcmd:
  - systemctl restart sshd.service
```

Main documentation page: https://cloudinit.readthedocs.io/en/latest/index.html Personally I found [examples](https://cloudinit.readthedocs.io/en/latest/topics/examples.html) and [modules](https://cloudinit.readthedocs.io/en/latest/topics/modules.html) most useful.

Creating image:

```bash
genisoimage -output /var/lib/libvirt/images/test1-cidata.iso -input-charset utf8 -volid cidata -joliet -rock user-data meta-data
```

##### Creating VM

As I previously wrote we will use `virt-install` for creating VM:

```bash
$ virt-install \
  --name test1 \
  --virt-type kvm \
  --os-type linux \
  --os-variant ubuntu18.04 \
  --memory 1024 \
  --vcpus=1 \
  --disk /var/lib/libvirt/images/test1.qcow2,format=qcow2 \
  --disk /var/lib/libvirt/images/test1-cidata.iso,device=cdrom \
  --network network=default \
  --graphics none \
  --import \
  --noautoconsole

Starting install...
Domain creation completed.
```

I do not think that arguments need comments, they are pretty obvious. After this command we need get Virtual Machine IP address (because libvirt uses [dnsmasq](http://www.thekelleys.org.uk/dnsmasq/doc.html) for DHCP, see [libvirtd and dnsmasq (wiki page)](https://wiki.libvirt.org/page/Libvirtd_and_dnsmasq)).

```bash
$ virsh list
 Id   Name    State
-----------------------
 19   test1   running
$ virsh domifaddr test1
 Name       MAC address          Protocol     Address
-------------------------------------------------------------------------------
 vnet0      52:54:00:3d:78:cf    ipv4         192.168.122.111/24
```

Our IP is `192.168.222.111` and we can connect with SSH:

```bash
ssh -o "UserKnownHostsFile=/dev/null" -o "StrictHostKeyChecking=no" root@192.168.122.111
```

Also, now we can eject our image with `cloud-init` data:

```bash
virsh change-media --domain test1 sda --eject
```

##### Static IP

If we trying reproduce some system dynamic IP address are not helpful, because configs oftenly have hard coded IP of services, so we need use static IP addresses for our VMs.

Unfortunatelly there is no very easy ways to do it, but this possible:

```bash
virt-install \
  --name test1 \
  --virt-type kvm \
  --os-type linux \
  --os-variant ubuntu18.04 \
  --memory 1024 \
  --vcpus=1 \
  --disk /var/lib/libvirt/images/test1.qcow2,format=qcow2 \
  --disk /var/lib/libvirt/images/test1-cidata.iso,device=cdrom \
  --network network=default \
  --graphics none \
  --import \
  --noautoconsole \
  --print-xml | virsh define /dev/stdin

virsh net-update default add ip-dhcp-host "<host mac='"$(virsh dumpxml test1 | grep -oP "mac address='\K[0-9a-f:]*")"' name='test1' ip='192.168.122.10' />" --live --config
virsh net-update default delete ip-dhcp-host "<host mac='"$(virsh dumpxml test1 | grep -oP "mac address='\K[0-9a-f:]*")"' name='test1' ip='192.168.122.10' />" --live --config
```

Instead creating VM with `virt-install` we only define it with `virtsh` without starting, next we set IP `192.168.122.10` for our VM by MAC address. As result you should see:

```bash
Updated network default persistent config and live state
```

Other `virsh net-update` commands: https://wiki.libvirt.org/page/Networking#virsh_net-update

##### Destroy

For removing our VM we need:

1) Stop it with `destroy` command: `virsh destroy test1`
2) Undefine (remove info about it from `libvirtd`): `virsh undefine test1`
