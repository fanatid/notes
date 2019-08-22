const dns = require('dns')
const test = require('./test-fn')

test(1e5, 100, (callback) => {
  dns.lookup('a.example.com', { family: 4 }, (err) => {
    if (err) console.error(err)
    callback()
  })
})
