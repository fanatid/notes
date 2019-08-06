output "ip4_map" {
  description = "Map of private ipv4 to public ipv4"
  value = {
    "${hcloud_server_network.nginx0_network.ip}" = "${hcloud_server.nginx0.ipv4_address}"
    "${hcloud_server_network.nginx1_network.ip}" = "${hcloud_server.nginx1.ipv4_address}"
    "${hcloud_server_network.client_network.ip}" = "${hcloud_server.client.ipv4_address}"
  }
}

output "nginx0_cmd" {
  description = "nginx0 cmd for re-assign aliased ip"
  value = "hcloud server change-alias-ips --network ${hcloud_network.default.id} --clear ${hcloud_server.nginx1.id} && hcloud server change-alias-ips --network ${hcloud_network.default.id} --alias-ips 10.0.1.1 ${hcloud_server.nginx0.id}"
}

output "nginx1_cmd" {
  description = "nginx1 cmd for re-assign aliased ip"
  value = "hcloud server change-alias-ips --network ${hcloud_network.default.id} --clear ${hcloud_server.nginx0.id} && hcloud server change-alias-ips --network ${hcloud_network.default.id} --alias-ips 10.0.1.1 ${hcloud_server.nginx1.id}"
}
