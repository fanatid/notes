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
  name     = "WireGuard Example"
  ip_range = "10.0.0.0/8"
}

resource "hcloud_network_subnet" "vpn" {
  network_id   = "${hcloud_network.default.id}"
  type         = "server"
  network_zone = "eu-central"
  ip_range     = "10.0.2.0/24"
}

resource "hcloud_network_subnet" "test" {
  network_id   = "${hcloud_network.default.id}"
  type         = "server"
  network_zone = "eu-central"
  ip_range     = "10.0.3.0/24"
}

# WireGuard Server
resource "hcloud_server" "wireguard" {
  name        = "wireguard"
  image       = "${var.wireguard_server.image}"
  server_type = "${var.wireguard_server.server_type}"
  datacenter  = "${var.wireguard_server.datacenter}"
  user_data   = "${file("./user-data/wireguard.sh")}"
  ssh_keys    = "${hcloud_ssh_key.default[*].name}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "hcloud_server_network" "wireguard_network" {
  network_id = "${hcloud_network.default.id}"
  server_id  = "${hcloud_server.wireguard.id}"
  ip         = "10.0.2.1"
}

# Test Nodes
resource "hcloud_server" "test" {
  count = "${var.test_pool_size}"

  name        = "test-${count.index}"
  image       = "${var.test_pool_server.image}"
  server_type = "${var.test_pool_server.server_type}"
  datacenter  = "${var.test_pool_server.datacenter}"
  user_data   = "${file("./user-data/test.sh")}"
  ssh_keys    = "${hcloud_ssh_key.default[*].name}"
}

resource "hcloud_server_network" "test_network" {
  count = length(hcloud_server.test)

  network_id = "${hcloud_network.default.id}"
  server_id  = "${hcloud_server.test[count.index].id}"
  ip         = "10.0.3.${count.index + 1}"
}
