const dns = require('dns')
const test = require('./test-fn')

test(1e5, 100, (callback) => {
  dns.resolve('a.example.com', 'A', (err) => {
    if (err) console.error(err)
    callback()
  })
})
