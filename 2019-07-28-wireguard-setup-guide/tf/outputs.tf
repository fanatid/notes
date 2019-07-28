output "wireguard_ip4" {
  description = "Map of public ipv4 to private ipv4 for VPN (WireGuard) Server"
  value       = "${hcloud_server.wireguard.ipv4_address} => ${hcloud_server_network.wireguard_network.ip}"
}

output "test_pool_ip4" {
  description = "Map of public ipv4 addresses to private ipv4 address of Servers from test pool"
  value       = { for i in range(length(hcloud_server.test)) : hcloud_server.test[i].ipv4_address => hcloud_server_network.test_network[i].ip }
}
