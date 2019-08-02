example.com.      IN  SOA dns.example.com. dns.example.com. 1564497611 2h 30m 1d 30
a.example.com.    IN  A 10.0.3.1
b.example.com.    IN  CNAME a.example.com.
c.example.com.    IN  A 10.0.3.3
