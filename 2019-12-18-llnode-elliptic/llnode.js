const EC = require('elliptic').ec
const BN = require('bn.js')
// const llnode = require('llnode')
const { fromCoredump } = require('../../llnode')

const secp256k1 = new EC('secp256k1')
const knownPubKey = process.argv[3]

// zero item path to node
// second item path to coredump
const llnode = fromCoredump(process.argv[2], process.argv[0])
const types = llnode.getHeapTypes()

const keyPairHeapType = types.filter(({ typeName }) => typeName === 'KeyPair')[0]
console.log(`Found ${keyPairHeapType ? keyPairHeapType.instanceCount : 0} KeyPair instances.`)

const bnHeapType = types.filter(({ typeName }) => typeName === 'BN')[0]
console.log(`Found ${bnHeapType ? bnHeapType.instanceCount : 0} BN instances.`)

if (!bnHeapType) {
  console.log(`No BN instances, exit`)
  process.exit(1)
}

for (const { value } of bnHeapType.instances[Symbol.iterator]()) {
  if (value.endsWith('<Object: BN >')) continue

  const negative = parseInt(value.match(/negative=<Smi: (\d+)>/)[1], 10)
  const wordsAddr = value.match(/words=(0x.[0-9a-f]+):/)[1]
  const length = parseInt(value.match(/length=<Smi: (\d+)/)[1], 10)
  if (isNaN(negative) || !wordsAddr || isNaN(length)) continue
  if (negative) continue

  const words = llnode.getObjectAtAddress(wordsAddr).value

  const bn = new BN()
  bn.length = length

  for (let i = 0; i < bn.length; ++i) {
    bn.words[i] = parseInt(new RegExp(`\\[${i}]=<Smi: (\\d+)>`).exec(words)[1], 10)
  }

  if (bn.cmp(secp256k1.curve.n) >= 0 || bn.isZero()) continue

  const kp = secp256k1.keyFromPrivate(bn)
  const pubkey = kp.getPublic(true, 'hex')
  if (pubkey === knownPubKey) {
    console.log(`Found private key for given public key!`)
    console.log(`${kp.getPrivate('hex')} => ${kp.getPublic(true, 'hex')}`)
    break
  }
}
