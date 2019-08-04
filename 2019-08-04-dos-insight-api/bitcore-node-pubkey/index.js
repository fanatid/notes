const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const https = require('https')
const { URL } = require('url')
const secp256k1 = require('secp256k1')

const baseUrl = 'https://api.bitcore.io/api/BTC/mainnet'
const privateKey = Buffer.from('4f79da18f3f552bd0e8c16bc5dbe797293d12bf38fad74a9595d565d80049518', 'hex')
const publicKey = secp256k1.publicKeyCreate(privateKey)

const utxoAddresses = fs.readFileSync(path.join(__dirname, 'utxo-stats'), 'utf-8').split('\n').map((x) => x.split(' ')[1]).filter((x) => x)

async function makeRequest (url, opts, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, opts)
    req.on('error', reject)
    req.on('timeout', () => {
      req.abort()
      reject(new Error('Timeout error'))
    })
    req.on('response', (resp) => {
      console.log(`${resp.statusCode}: ${resp.statusMessage}`)
      if (resp.statusCode !== 200) {
        // return reject(new Error(`${resp.statusCode}: ${resp.statusMessage}`))
      }

      const chunks = []
      resp.on('data', (chunk) => chunks.push(chunk))
      resp.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })

    req.end(data)
  })
}

function sha256x2 (buffer) {
  buffer = crypto.createHash('sha256').update(buffer).digest()
  return crypto.createHash('sha256').update(buffer).digest()
}

function getSignature (url, method, body = JSON.stringify({})) {
  const parsedUrl = new URL(url)
  const msg = [method, parsedUrl.pathname + parsedUrl.search, body].join('|')
  const msgHash = sha256x2(Buffer.from(msg))
  return secp256k1.sign(msgHash, privateKey).signature.toString('hex')
}

async function walletCallGetMethod (method) {
  const url = `${baseUrl}/wallet/${publicKey.toString('hex')}${method}`
  const headers = { 'Content-Type': 'application/json', 'x-signature': getSignature(url, 'GET') }
  return makeRequest(url, { headers })
}

async function walletCreate () {
  const headers = { 'Content-Type': 'application/json' }
  const body = JSON.stringify({
    name: 'PubKey Tests',
    pubKey: publicKey.toString('hex'),
    path: "m/44'/0'/0'"
  })
  const data = await makeRequest(`${baseUrl}/wallet/`, { method: 'POST', headers }, body)
  return data === 'Wallet already exists' ? data : `Wallet created, id: ${JSON.parse(data)._id}`
}

async function walletImportAddresses (addresses) {
  const url = `${baseUrl}/wallet/${publicKey.toString('hex')}`
  const body = JSON.stringify(addresses.map((address) => ({ address })))
  const headers = { 'Content-Type': 'application/octet-stream', 'x-signature': getSignature(url, 'POST', body) }
  return await makeRequest(url, { method: 'POST', headers }, body)
}

;(async () => {
  // console.log(await walletCreate())
  // console.log(await walletCallGetMethod(''))
  console.log(await walletCallGetMethod('/check'))
  console.log(await walletImportAddresses(utxoAddresses))
  console.log(await walletCallGetMethod('/balance'))
  // console.log(await walletCallGetMethod('/addresses')) // not deployed end?
})().catch((err) => {
  console.error(err.stack || err)
  process.exit(1)
})
