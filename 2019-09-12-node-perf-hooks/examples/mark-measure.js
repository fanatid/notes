const { performance, PerformanceObserver } = require('perf_hooks')

const obs = new PerformanceObserver((items) => {
  const entry = items.getEntries()[0]
  console.log(JSON.stringify(entry))

  if (entry.entryType === 'measure') {
    obs.disconnect()
    performance.clearMarks('A')
    performance.clearMarks('B')
  }
})
obs.observe({ entryTypes: ['mark', 'measure'] })

function doSomeWork () {
  for (let i = 0; i < 1e8; ++i);
}

;(async () => {
  performance.mark('A')
  doSomeWork()
  performance.mark('B')
  performance.measure('A to B', 'A', 'B')
})().catch((err) => {
  console.error(err.stack || err)
  process.exit(1)
})
