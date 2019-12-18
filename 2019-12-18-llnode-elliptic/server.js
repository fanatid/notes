const http = require('http')
const EC = require('elliptic').ec

const secp256k1 = new EC('secp256k1')

const server = http.createServer((req, res) => {
  const keypair = secp256k1.genKeyPair()
  const seckey = keypair.getPrivate('hex')
  const pubkey = keypair.getPublic(true, 'hex')
  console.log(`${seckey} => ${pubkey}`)

  res.end(pubkey + '\n')

  if (global.gc) setTimeout(global.gc, 100)
})

server.on('error', (err) => {
  console.error(err.stack || err)
  process.exit(1)
})

const port = 8000
server.listen(port, (err) => console.log(`Server at localhost:${port} (pid: ${process.pid})`))
