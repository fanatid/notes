variable "hcloud_token" {
  type        = string
  description = "Hetzner Cloud API Token"

  default = "A2fMl7W5Q7aN5J4pZcmFMOuKjRKNvPaBbH4VLBkuC1Cn5aVbLCEyikt2XFhB3wiC"
}

variable "ssh_keys" {
  type        = map(string)
  description = "Map of SSH Keys on servers by default, name => key"

  default = {
    "Kirill Fomichev" = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDrN2DVTlDzXklIDAkvet62Ve5uQPNpCCc0EG9JjGBzpWGy80r1KLgJgas5xLJYGZaygfuxY6Iij3mZ3QHVbCa3XITjojR8v53jUGXQ0Ouo/D3VaBdRqeno7iJu6GsWKfVo15duf49f4AB98pj7BqXcHxj8xyxLSb2keUwvi7ugJb3KDpEjdWprajN92Uj/uT4PpDM5xrSRb1QVwXJ0XWz8TKZKlhH0xD3UWjLEhQjOk6PO31Dcip+k9waxyJGlmLy/c7Z8KA5gOzGbpN3q1phV4OPzKj6RlkJj0YY1Lvqt8aV4QqLfKFatBGL0+5GyEkckWUsJkXbmcaVbMvXU0Oqb fanatid@ya.ru"
  }
}

variable "wireguard_server" {
  type        = map(string)
  description = "Map options for WireGuard Server"

  default = {
    image       = "ubuntu-18.04"
    server_type = "cx11-ceph"
    datacenter  = "nbg1-dc3"
  }
}

variable "test_pool_size" {
  type        = number
  description = "Pool Size of test nodes"

  default = 2
}

variable "test_pool_server" {
  type        = map(string)
  description = "Map options for Servers from Test Pool"

  default = {
    image       = "ubuntu-18.04"
    server_type = "cx11-ceph"
    datacenter  = "nbg1-dc3"
  }
}
