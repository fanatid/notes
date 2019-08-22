const dns = require('dns')
const test = require('./test-fn')

const lookup = createLookupCache()
test(1e5, 100, (callback) => {
  lookup('a.example.com', { family: 4 }, (err) => {
    if (err) console.error(err)
    callback()
  })
})

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
