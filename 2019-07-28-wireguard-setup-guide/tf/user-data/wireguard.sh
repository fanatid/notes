#cloud-config
packages:
  - python
  - iptables-persistent
runcmd:
  - iptables -A INPUT -i eth0 -p udp --dport 51820 -j ACCEPT                       # Allow WireGuard
  - iptables -A INPUT -i eth0 -p tcp --dport 22 -j ACCEPT                          # Allow SSH
  - iptables -A INPUT -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT # Allow ESTABLISHED
  - iptables -A INPUT -i eth0 -p icmp -j ACCEPT                                    # Allow ICMP
  - iptables -A INPUT -i eth0 -j DROP                                              # Drop rest
  - iptables-save > /etc/iptables/rules.v4                                         # Save ipv4 rules

  - ip6tables -A INPUT -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT # Allow ESTABLISHED
  - ip6tables -A INPUT -i eth0 -p icmpv6 -j ACCEPT                                  # Allow ICMP
  - ip6tables -A INPUT -i eth0 -j DROP                                              # Drop rest
  - ip6tables-save > /etc/iptables/rules.v6                                         # Save ipv6 rules
