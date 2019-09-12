const { performance } = require('perf_hooks')

process.on('exit', () => console.log(performance.nodeTiming))
process.nextTick(() => {})
