const http2 = require('http2')
const { PerformanceObserver } = require('perf_hooks')

const obs = new PerformanceObserver((items) => {
  const entry = items.getEntries()[0]
  console.log(JSON.stringify(entry))
})
obs.observe({ entryTypes: ['http2'] })

const server = http2.createServer({}, (req, res) => res.end('ok')).listen(8000)
server.once('listening', () => {
  const client = http2.connect('http://localhost:8000')
  client
    .request()
    .on('data', () => {})
    .once('close', () => client.close())
    .once('close', () => server.close())
    .end()
})
