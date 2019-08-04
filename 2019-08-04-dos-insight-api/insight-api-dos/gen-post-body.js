const fs = require('fs')
const path = require('path')

const bs58 = require('bs58')
bs58.encode(Buffer.allocUnsafe(1000).fill(0xff)) // warm-up

const ssize = 99980
const size = ((ssize * (Math.log(58) / Math.log(256))) + 1) >>> 0
const bs58s = bs58.encode(Buffer.allocUnsafe(size).fill(0xff))
fs.writeFileSync(path.join(__dirname, 'insight-dos-addrs.json'), `{"addrs":"${bs58s}"}`, 'utf-8')
