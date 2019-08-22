const dns = require('dns')
const test = require('./test-fn')

const resolver = new dns.Resolver()
resolver.setServers(['8.8.8.8'])

test(1e3, 100, (callback) => {
  resolver.resolve('google.com', 'A', (err) => {
    if (err) console.error(err)
    callback()
  })
})
