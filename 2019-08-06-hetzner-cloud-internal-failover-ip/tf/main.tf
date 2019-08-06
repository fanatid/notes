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
  name     = "LVS Example"
  ip_range = "10.0.0.0/8"
}

resource "hcloud_network_subnet" "nginx" {
  network_id   = "${hcloud_network.default.id}"
  type         = "server"
  network_zone = "eu-central"
  ip_range     = "10.0.1.0/24"
}

resource "hcloud_network_subnet" "client" {
  network_id   = "${hcloud_network.default.id}"
  type         = "server"
  network_zone = "eu-central"
  ip_range     = "10.0.2.0/24"
}

# NGINX0
resource "hcloud_server" "nginx0" {
  name        = "nginx0"
  image       = "ubuntu-18.04"
  server_type = "cx11-ceph"
  datacenter  = "nbg1-dc3"
  ssh_keys    = "${hcloud_ssh_key.default[*].name}"
}

resource "hcloud_server_network" "nginx0_network" {
  network_id = "${hcloud_network.default.id}"
  server_id  = "${hcloud_server.nginx0.id}"
  ip         = "10.0.1.2"
}

# NGINX1
resource "hcloud_server" "nginx1" {
  name        = "nginx1"
  image       = "ubuntu-18.04"
  server_type = "cx11-ceph"
  datacenter  = "fsn1-dc14"
  ssh_keys    = "${hcloud_ssh_key.default[*].name}"
}

resource "hcloud_server_network" "nginx1_network" {
  network_id = "${hcloud_network.default.id}"
  server_id  = "${hcloud_server.nginx1.id}"
  ip         = "10.0.1.3"
}

# client
resource "hcloud_server" "client" {
  name        = "client"
  image       = "ubuntu-18.04"
  server_type = "cx11-ceph"
  datacenter  = "nbg1-dc3"
  ssh_keys    = "${hcloud_ssh_key.default[*].name}"
}

resource "hcloud_server_network" "client_network" {
  network_id = "${hcloud_network.default.id}"
  server_id  = "${hcloud_server.client.id}"
  ip         = "10.0.2.1"
}
