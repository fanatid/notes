output "master_loadbalancer_ipv4" {
  description = "Public ipv4 address of master loadbalancer"
  value       = "${hcloud_server_network.master_loadbalancer_network.ip} => ${hcloud_server.master_loadbalancer.ipv4_address}"
}

output "master_ipv4" {
  description = "Map of private ipv4 to public ipv4 for masters"
  value       = { for i in range(length(hcloud_server.master)) : hcloud_server_network.master_network[i].ip => hcloud_server.master[i].ipv4_address }
}

output "worker_ipv4" {
  description = "Map of private ipv4 to public ipv4 for workers"
  value       = { for i in range(length(hcloud_server.worker)) : hcloud_server_network.worker_network[i].ip => hcloud_server.worker[i].ipv4_address }
}
