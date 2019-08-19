provider "hcloud" {
  version = "~> 1.11"
  token   = "${var.hcloud_token}"
}

# SSH keys
resource "hcloud_ssh_key" "default" {
  count = "${length(var.ssh_keys)}"

  name       = "${keys(var.ssh_keys)[count.index]}"
  public_key = "${values(var.ssh_keys)[count.index]}"
}

# Private Network and subnets
resource "hcloud_network" "default" {
  name     = "kubernetes"
  ip_range = "10.0.0.0/8"
}

resource "hcloud_network_subnet" "master" {
  network_id   = "${hcloud_network.default.id}"
  type         = "server"
  network_zone = "eu-central"
  ip_range     = "10.0.1.0/24"
}

resource "hcloud_network_subnet" "worker" {
  network_id   = "${hcloud_network.default.id}"
  type         = "server"
  network_zone = "eu-central"
  ip_range     = "10.0.2.0/24"
}

# Control planes (master)
resource "hcloud_server" "master_loadbalancer" {
  name        = "master-loadbalancer"
  image       = "ubuntu-18.04"
  server_type = "cx11-ceph"
  user_data   = "${file("./user-data/default.sh")}"
  ssh_keys    = "${hcloud_ssh_key.default[*].name}"
}

resource "hcloud_server_network" "master_loadbalancer_network" {
  network_id = "${hcloud_network.default.id}"
  server_id  = "${hcloud_server.master_loadbalancer.id}"
  ip         = "10.0.1.1"
}

resource "hcloud_server" "master" {
  count = 3

  name        = "master${count.index}"
  image       = "ubuntu-18.04"
  server_type = "cx31-ceph"
  user_data   = "${file("./user-data/default.sh")}"
  ssh_keys    = "${hcloud_ssh_key.default[*].name}"
}

resource "hcloud_server_network" "master_network" {
  count = length(hcloud_server.master)

  network_id = "${hcloud_network.default.id}"
  server_id  = "${hcloud_server.master[count.index].id}"
  ip         = "10.0.1.${count.index + 2}"
}

# Worker
resource "hcloud_server" "worker" {
  count = 2

  name        = "worker${count.index}"
  image       = "ubuntu-18.04"
  server_type = "cx31-ceph"
  user_data   = "${file("./user-data/default.sh")}"
  ssh_keys    = "${hcloud_ssh_key.default[*].name}"
}

resource "hcloud_server_network" "worker_network" {
  count = length(hcloud_server.worker)

  network_id = "${hcloud_network.default.id}"
  server_id  = "${hcloud_server.worker[count.index].id}"
  ip         = "10.0.2.${count.index + 1}"
}
