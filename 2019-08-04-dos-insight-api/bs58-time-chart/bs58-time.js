const worker = require('worker_threads')

async function mainMaster () {
  const path = require('path')
  const os = require('os')
  const ProgressBar = require('progress')
  const plt = require('matplotnode')

  const data = { length: [], time: [] }
  const lengthArr = new Array(101).fill(null).map((x, i) => Math.max(10, i * 1000))

  const threads = Math.max(1, (os.cpus().length / 4) >>> 0)
  const bar = new ProgressBar(':bar :percent', { total: lengthArr.length, width: Math.min(80, process.stdout.columns || 50) })
  bar.render()
  await Promise.all(new Array(threads).fill(null).map(() => {
    return new Promise((resolve) => {
      const wrk = new worker.Worker(__filename)

      wrk.on('error', (err) => console.error(`Error from worker#${wrk.threadId}: ${err.message}`))
      wrk.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker#${wrk.threadId} exited with code ${code}`)
        }

        resolve()
      })

      wrk.on('message', (result) => {
        if (result !== null) {
          data.length.push(result.length)
          data.time.push(result.time)
          bar.tick()
        }

        wrk.postMessage(lengthArr.pop())
      })
    })
  }))
  bar.render()

  plt.title('bs58 time/length')
  plt.xlabel('length, symbols')
  plt.ylabel('time, ms')
  plt.plot(data.length, data.time, 'marker=.', 'linestyle=None')
  plt.save(path.join(__dirname, `${path.parse(__filename).name}.png`))
}

async function mainSlave () {
  const bs58 = require('bs58')
  bs58.encode(Buffer.allocUnsafe(1000).fill(0xff)) // warm-up

  worker.parentPort.on('message', (length) => {
    if (length === undefined) {
      worker.parentPort.unref()
      return
    }

    const ts = process.hrtime()
    const size = ((length * (Math.log(58) / Math.log(256))) + 1) >>> 0
    bs58.encode(Buffer.allocUnsafe(size).fill(0xff))
    const diff = process.hrtime(ts)
    const time = diff[0] * 1e3 + diff[1] / 1e6

    worker.parentPort.postMessage({ length, time })
  })

  worker.parentPort.postMessage(null)
}

(worker.isMainThread ? mainMaster : mainSlave)().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
