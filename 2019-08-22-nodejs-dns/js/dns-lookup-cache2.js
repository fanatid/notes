const dns = require('dns')
const test = require('./test-fn')

const lookup = createLookupCache()
test(1e5, 100, (callback) => {
  lookup('a.example.com', { family: 4 }, (err) => {
    if (err) console.error(err)
    callback()
  })
})

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
