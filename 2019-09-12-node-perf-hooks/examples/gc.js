const { PerformanceObserver, constants } = require('perf_hooks')

const obs = new PerformanceObserver((items) => {
  const entry = items.getEntries()[0]
  console.log(JSON.stringify(entry))
})
obs.observe({ entryTypes: ['gc'] })

const gcweak = require('bindings')('gcweak')
gcweak.fn1.call({})

global.gc(true)

setTimeout(() => {}, 50)
