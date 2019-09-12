const http = require('http')
const { PerformanceObserver } = require('perf_hooks')

const obs = new PerformanceObserver((items) => {
  const entry = items.getEntries()[0]
  console.log(JSON.stringify(entry))
})
obs.observe({ entryTypes: ['http'] })

const server = http.createServer((req, res) => res.end('ok')).listen(8000)
server.once('listening', () => {
  http.request('http://localhost:8000/')
    .on('data', () => {})
    .once('close', () => server.close())
    .end()
})
