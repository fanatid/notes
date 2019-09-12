const { performance, PerformanceObserver } = require('perf_hooks')

const obs = new PerformanceObserver((items) => {
  const entry = items.getEntries()[0]
  console.log(JSON.stringify(entry))
  obs.disconnect()
})
obs.observe({ entryTypes: ['function'] })

function doSomeWork () {
  for (let i = 0; i < 1e8; ++i);
}

performance.timerify(doSomeWork)()
