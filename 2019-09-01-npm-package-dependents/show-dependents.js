#!/usr/bin/env node
const https = require('https')
const { EOL } = require('os')
const stream = require('stream')

async function makeRequest (url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers })
    req.on('error', reject)
    req.on('timeout', () => {
      req.abort()
      reject(new Error('Timeout error'))
    })
    req.on('response', (resp) => {
      if (resp.statusCode !== 200) {
        return reject(new Error(resp.statusMessage))
      }

      const chunks = []
      resp.on('data', (chunk) => chunks.push(chunk))
      resp.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })

    req.end()
  })
}

async function makeRequestJSON (...args) {
  return JSON.parse(await makeRequest(...args))
}

async function getTotal (pkg) {
  const html = await makeRequest(`https://www.npmjs.com/package/${pkg}`)
  const match = html.match(/href="\?activeTab=dependents">.*?>([0-9,]+)/) || ['', '']

  const value = parseInt(match[1].replace(/,/, ''), 10)
  if (Number.isInteger(value)) return value

  throw new Error(`Invalid number of dependents: ${match}`)
}

function delay (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class FetchDepsStream extends stream.Readable {
  constructor (pkg, total) {
    super({ objectMode: true })

    this.pkg = pkg
    this.offset = 0
    this.step = 36
    this.total = total

    this.lastFetch = 0
    this.delayBetweenRequests = 1000
  }

  async _read () {
    if (this.offset >= this.total) {
      this.push(null)
      return
    }

    const sleep = this.lastFetch + this.delayBetweenRequests - Date.now()
    if (sleep > 0) await delay(sleep)

    const XHRHeaders = { 'x-requested-with': 'XMLHttpRequest', 'x-spiferack': 1 }
    const { packages } = await makeRequestJSON(`https://www.npmjs.com/browse/depended/${this.pkg}?offset=${this.offset}`, XHRHeaders)
    for (const pkg of packages) this.push(pkg.name)

    this.lastFetch = Date.now()
    this.offset += this.step

    if (packages.length < 36) this.push(null)
  }
}

class FetchStatsTransform extends stream.Transform {
  constructor (pkg, bar) {
    super({ objectMode: true })

    this.pkg = pkg
    this.bar = bar

    this.queue = []
    this.pkgsPerRequest = 128

    this.stats = []

    this.lastFetch = 0
    this.delayBetweenRequests = 250
  }

  async fetch (pkg) {
    const sleep = this.lastFetch + this.delayBetweenRequests - Date.now()
    if (sleep > 0) await delay(sleep)

    const pkgs = pkg ? [pkg] : this.queue.splice(0, this.pkgsPerRequest)

    // https://github.com/npm/registry/blob/master/docs/download-counts.md
    let stats = await makeRequestJSON(`https://api.npmjs.org/downloads/point/last-month/${pkgs.join(',')}`)
    if (pkg) stats = { [stats.package]: { downloads: stats.downloads } }

    for (const [pkg, { downloads }] of Object.entries(stats)) this.stats.push({ package: pkg, downloads })
    this.bar.tick(pkgs.length)

    this.lastFetch = Date.now()
  }

  async _flush (callback) {
    while (this.queue.length > 0) await this.fetch()

    this.stats.sort((a, b) => b.downloads - a.downloads)

    const nfmt = new Intl.NumberFormat('en')
    for (const item of this.stats) item.downloads = nfmt.format(item.downloads)

    callback(null, this.stats)
  }

  async _transform (pkg, encoding, callback) {
    const isScoped = pkg.startsWith('@')
    if (isScoped) {
      await this.fetch(pkg)
    } else {
      this.queue.push(pkg)
      if (this.queue.length >= this.pkgsPerRequest) await this.fetch()
    }

    callback(null)
  }
}

async function fetch (pkg, total, bar) {
  return new Promise((resolve, reject) => {
    const deps = new FetchDepsStream(pkg, total)
    const stats = new FetchStatsTransform(pkg, bar)

    stats.on('error', reject)
    stats.on('data', resolve)
    stats.on('end', () => reject(new Error('stream end without data, it\'s wrong')))

    deps.pipe(stats)
  })
}

function createProgressBar (total) {
  const stream = process.stdout
  if (!stream.isTTY) {
    return {
      tick () {},
      stop () {}
    }
  }

  let curr = 0

  const ts = process.hrtime()
  function draw () {
    const diffTS = process.hrtime(ts)
    stream.cursorTo(0)
    stream.write(`Processed ${curr} / ${total} (${(curr * 100 / total).toFixed(2)}%), elapsed: ${(diffTS[0] + diffTS[1] / 1e9).toFixed(2)}s`)
    stream.clearLine(1)
  }
  const drawId = setInterval(draw, ~~(1000 / 62)).unref() // 62 fps

  return {
    tick (len) {
      curr = Math.min(curr + len, total)
      draw()
    },

    stop () {
      clearInterval(drawId)
      stream.write(EOL)
    }
  }
}

;(async () => {
  const pkg = process.argv[2]
  const total = await getTotal(pkg)

  const bar = createProgressBar(total)
  const data = await fetch(pkg, total, bar)
  bar.stop()

  console.table(data, ['package', 'downloads'])
})().catch((err) => {
  console.error(err.stack || err)
  process.exit(1)
})
