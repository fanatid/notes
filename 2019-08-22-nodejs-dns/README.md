# DNS in Node.js

Currently latest release is [v12.9.0](https://nodejs.org/en/blog/release/v12.9.0/), so all links will refer to this version.

### Local DNS Server

Probably simpler way run local DNS server is run [CoreDNS](https://coredns.io/) in [Docker](https://docker.com/) (configs already in [coredns folder](./coredns)):

```bash
docker run -it --rm -v $(pwd)/coredns:/etc/coredns:ro -w /etc/coredns -p 127.0.0.2:53:53/udp coredns/coredns:1.6.2
```

Config define two records:

  - `a.example.com` — `A` (`127.0.0.1`)
  - `b.example.com` — `CNAME` (`a.example.com`)

For testing launched server:

```bash
dig +noall b.example.com @127.0.0.2 +answer
b.example.com.    0 IN  CNAME a.example.com.
a.example.com.    0 IN  A 10.0.0.0
```

### Node.js

[Node.js](https://nodejs.org/) provide two implementations: `dns.lookup` and various `dns.resolve*()`/`dns.reverse()`. See doc: https://nodejs.org/docs/v12.9.0/api/dns.html#dns_implementation_considerations

Difference between them that `dns.lookup` use synchronous [getaddrinfo(3)](http://man7.org/linux/man-pages/man3/getaddrinfo.3.html) call. Result will be same as for most other programs. But synchronous call means that [UV Thread Pool](http://docs.libuv.org/en/v1.x/threadpool.html) used and `UV_THREADPOOL_SIZE` value is important. By default networking API in Node.js uses this implementation.

Second implementation `dns.resolve*()` use [c-ares](https://c-ares.haxx.se/), where DNS queries always use network. This network communication always asyncronous, so libuv threadpool not used.

Source code:

  - `dns.lookup` dispatch: https://github.com/nodejs/node/blob/v12.9.0/src/cares_wrap.cc#L1987
  - `c-ares` query: https://github.com/nodejs/node/blob/v12.9.0/src/cares_wrap.cc#L611

### Tests

For testing local DNS server with `dns.lookup()` you will need change `resolv.conf`:

```bash
cat > /etc/resolv.conf <<EOF
nameserver 127.0.0.2
EOF
```

I put all js scripts to [js folder](./js), so tests (100k queries with 100 parallel):

```bash
$ UV_THREADPOOL_SIZE=4 node js/dns-lookup.js
Elapsed time: 7633.409ms
$ UV_THREADPOOL_SIZE=20 node js/dns-lookup.js
Elapsed time: 3215.393ms
$ node js/dns-resolve.js 
Elapsed time: 1626.655ms
```

As we can see increse number of `UV_THREADPOOL_SIZE` improve performance, but in such way we receive more created threads for process and `c-ares` still faster. Also, important note that all these queries were resolved with local DNS server, but what if we try resolve with public DNS (like `8.8.8.8`)?

I modified script (change total to 1000), because wait 100k queries will take a lot of time.

```bash
$ node js/dns-resolve-public-dns.js 
Elapsed time: 11596.718ms
```

And this just 1000 queries! i.e. slower \~150 times. What if our application will need resolve 10k names at one time? This can take a lot of time.

### Optimization

One of the obvious solutions add DNS cache to program itself. And such package exists on npm (was published 6 years ago!): https://www.npmjs.com/package/dnscache

But if you check source code of this package you will find that code is overloaded, package redefine functions, try validate functions arguments and generate own errors. Because `dns.lookup` uses system `getaddrinfo` TTL values from DNS records are not honored. [Negative cache](https://en.wikipedia.org/wiki/Negative_cache) also exists, but should it be in program itself?

Instead we can use own wrapper, which \~30 lines of code:

```js
function createLookupCache () {
  const cache = new Map()

  return function dnslookup (hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options
      options = { family: 0 }
    }

    const key = `${hostname};${JSON.stringify(options)}`
    const cachedLookup = cache.get(key)
    if (cachedLookup !== undefined) {
      cachedLookup.callbacks.push(callback)
      return cachedLookup.reqWrap
    }

    const callbacks = [callback]
    const reqWrap = dns.lookup(hostname, options, (err, address, family) => {
      cache.delete(key)

      for (const callback of callbacks) {
        process.nextTick(callback, err, address, family)
      }
    })
    cache.set(key, { callbacks, reqWrap })

    return reqWrap
  }
}
```

Idea of such "cached" function is simple. If `dns.lookup` already executed for some arguments at current time we do not create another such request, instead we save callback for later call with result. Once `dns.lookup` call our callback we remove data from "cache", i.e. instead storing result of lookup we "merge" all same requests.

Result of such function:

```bash
$ UV_THREADPOOL_SIZE=4 node js/dns-lookup-cache.js
Elapsed time: 246.458ms
```

Elapsed time not going to zero because we send requests in chunks (100 items), and total 100k requests, i.e. with such function we will do 1000 requests (`100000 / 100 = 1000`).

If you still have problem with such number of requests, you can use similar function with real cache, but TTL should be as small as it possible:

```js
function createLookupCache (ttl = 10) {
  const cache = new Map()
  let nextCleanUp = Date.now() + 2 * ttl

  return function dnslookup (hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options
      options = { family: 0 }
    }

    const now = Date.now()
    if (nextCleanUp < now) {
      for (const [key, { validUpTo }] of cache.entries()) {
        if (validUpTo < now) cache.delete(key)
      }

      nextCleanUp = now + 2 * ttl
    }

    const key = `${hostname};${JSON.stringify(options)}`
    const cachedLookup = cache.get(key)
    if (cachedLookup !== undefined && !(cachedLookup.result !== null && cachedLookup.validUpTo < now)) {
      if (cachedLookup.result === null) cachedLookup.callbacks.push(callback)
      else process.nextTick(callback, ...cachedLookup.result)

      return cachedLookup.reqWrap
    }

    const callbacks = [callback]
    const reqWrap = dns.lookup(hostname, options, (err, address, family) => {
      for (const callback of callbacks) {
        process.nextTick(callback, err, address, family)
      }

      const obj = cache.get(key)
      obj.result = [err, address, family]
      obj.validUpTo = Date.now() + ttl
    })
    cache.set(key, { callbacks, reqWrap, result: null, validUpTo: null })

    return reqWrap
  }
}
```

```bash
$ UV_THREADPOOL_SIZE=4 node js/dns-lookup-cache2.js
Elapsed time: 105.517ms
```

### dgram / net / http

Network API in Node.js uses `dns.lookup()`, but we can redefine it.

##### dgram

For UDP we can pass `lookup` function to `dgram.createSocket`, see [docs](https://nodejs.org/api/dgram.html#dgram_dgram_createsocket_options_callback) / [source code](https://github.com/nodejs/node/blob/v12.9.0/lib/internal/dgram.js#L21-L50).

```js
dgram.createSocket({
  ...
  lookup: dnsCustomLookup
})
```

##### net

In `net` module custom `lookup` can be passed in `socket.connect`, see [docs](https://nodejs.org/api/net.html#net_socket_connect_options_connectlistener) / [source code](https://github.com/nodejs/node/blob/v12.9.0/lib/net.js#L940-L958). Optionally you also can pass `family` and `hints` as `dns.lookup()` options. If you planning use only IPv4 or IPv6 better set `family` to specified value, in such way you reduce number of DNS queries in 2 times (because by default value is `0` which produce `A` and `AAAA` queries).

```js
const sock = new net.Socket()
sock.connect({
  ...
  family: 4,
  lookup: dnsCustomLookup
})
```

##### http

Documentation about [http.request](https://nodejs.org/api/http.html#http_http_request_url_options_callback) not mention `lookup` redefinition directly, but behind the scene [http.Agent](https://nodejs.org/api/http.html#http_class_http_agent) in [agent.createConnection](https://nodejs.org/api/http.html#http_agent_createconnection_options_callback) call [net.createConnection](https://nodejs.org/api/net.html#net_net_createconnection_options_connectlistener) which call `socket.connect`, so `dns.lookup()` can be redefined in same way as for `net` module.

```js
http.request({
  ...
  family: 4,
  lookup: dnsCustomLookup
})
```

It's also possible save specified options to `http.Agent`:

```js
const agent = new http.Agent({ family: 4, lookup: dnsCustomLookup })
http.request({ agent })
```

or patch [http.globalAgent](https://nodejs.org/api/http.html#http_http_globalagent):

```js
http.globalAgent.options.family = 4
http.globalAgent.options.lookup = dnsCustomLookup
http.request({ ... })
```
