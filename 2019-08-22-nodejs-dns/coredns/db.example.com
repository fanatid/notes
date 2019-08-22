example.com.      IN  SOA dns.example.com. dns.example.com. 1564497611 2h 30m 1d 30
a.example.com.    IN  A 127.0.0.1
b.example.com.    IN  CNAME a.example.com.
