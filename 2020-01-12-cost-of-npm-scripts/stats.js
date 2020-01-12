#!/usr/bin/env node
const fs = require('fs').promises
const path = require('path')
const https = require('https')
const glob = require('glob')
const fse = require('fs-extra')
const tar = require('tar')
const yargs = require('yargs')
const prettyBytes = require('pretty-bytes')

function getArgs () {
  return yargs
    .usage('Usage: $0 <command> [options]')
    .wrap(yargs.terminalWidth())
    .options({
      lock: {
        alias: 'l',
        default: 'package-lock.json',
        description: 'Path to npm lock file',
        type: 'string'
      },
      'dir-packages': {
        coerce (dir) {
          fse.ensureDirSync(dir)
          return dir
        },
        default: path.join(__dirname, 'packages'),
        description: 'Path to directory for downloading and process packages',
        type: 'string'
      }
    })
    .help('help')
    .alias('help', 'h').argv
}

// helpers
async function applyFn (list, fn, workers = 3) {
  const result = new Array(list.length)
  let i = 0
  await Promise.all(new Array(workers).fill(null).map(async () => {
    while (i < list.length) result[i] = await fn(list[i++])
  }))
  return result
}

async function callback2promise (fn) {
  return new Promise((resolve, reject) => {
    return fn((err, ...args) => err ? reject(err) : resolve(args))
  })
}

// package-lock.json parser
async function getPackages (file, dirPackages) {
  const pkgs = []

  const lockFileText = await fs.readFile(file, 'utf8')
  const deps = Object.values(JSON.parse(lockFileText).dependencies)
  while (deps.length > 0) {
    const { resolved, dependencies } = deps.pop()
    if (!resolved) continue
    if (!resolved.startsWith('https://')) {
      throw new Error(`URL not supported: "${resolved}"`)
    }

    const name = path.parse(resolved).base
    const dest = path.join(dirPackages, name)
    const destRepack = path.join(dirPackages, `${name}-repack`)
    const destUpdated = path.join(destRepack, name)
    const destPackageJSON = path.join(destRepack, 'package', 'package.json')

    pkgs.push({
      name,
      dest,
      destRepack,
      destUpdated,
      destPackageJSON,
      url: resolved
    })

    if (dependencies) deps.push(...Object.values(dependencies))
  }

  return pkgs
}

// packages download
async function makeRequest (url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url)
    req.on('error', reject)
    req.on('timeout', () => {
      req.abort()
      reject(new Error('Timeout error'))
    })
    req.on('response', (resp) => {
      if (resp.statusCode !== 200) {
        return reject(new Error(`"${resp.statusMessage}" is not OK.`))
      }

      const chunks = []
      resp.on('data', (chunk) => chunks.push(chunk))
      resp.on('end', () => resolve(Buffer.concat(chunks)))
    })

    req.end()
  })
}

async function downloadPackage (pkg) {
  try {
    const stat = await fs.stat(pkg.dest)
    if (stat.isFile()) return

    throw new Error(`Package is not a file: ${pkg.dest}`)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  await fs.writeFile(pkg.dest, await makeRequest(pkg.url))
  console.log(`Package downloaded: ${pkg.name}`)
}

// package.json change functions
const requiredScriptsKeys = [
  // 'prepublish',
  // 'prepare',
  // 'prepublishOnly',
  // 'prepack',
  // 'postpack',
  // 'publish',
  // 'postpublish',
  'preinstall',
  'install',
  'postinstall',
  'preuninstall',
  'uninstall',
  'postuninstall'
  // 'preversion',
  // 'version',
  // 'postversion',
  // 'pretest',
  // 'test',
  // 'posttest',
  // 'prestop',
  // 'stop',
  // 'poststop',
  // 'prestart',
  // 'start',
  // 'poststart',
  // 'prerestart',
  // 'restart',
  // 'postrestart',
  // 'preshrinkwrap',
  // 'shrinkwrap',
  // 'postshrinkwrap'
]

const requiredPackageFields = [
  'name',
  'version',
  'description',
  'keywords',
  'homepage',
  'bugs',
  'license',
  'author',
  'contributors',
  // 'files',
  'main',
  'browser',
  'bin',
  'man',
  // 'directories',
  'repository',
  'scripts',
  // 'config',
  'dependencies',
  // 'devDependencies',
  'peerDependencies',
  // 'bundledDependencies',
  'optionalDependencies',
  'engines',
  'os',
  'cpu'
  // 'private',
  // 'publishConfig'
]

const packageJSONUpdate = {
  noop (pkg) {
    return pkg
  },
  scripts (pkg) {
    if (pkg.scripts === undefined) return pkg

    const scripts = {}
    for (const [key, value] of Object.entries(pkg.scripts)) {
      if (requiredScriptsKeys.includes(key)) scripts[key] = value
    }
    pkg.scripts = scripts
    return pkg
  },
  used (pkg) {
    pkg = packageJSONUpdate.scripts(pkg)
    const newPkg = {}
    for (const [key, value] of Object.entries(pkg)) {
      if (requiredPackageFields.includes(key)) newPkg[key] = value
    }
    return newPkg
  }
}

// package size
async function getPackageSize (pkg, fileList, packageJSON) {
  await fs.writeFile(pkg.destPackageJSON, JSON.stringify(packageJSON))

  await callback2promise((callback) => {
    // Options like in npm: https://github.com/npm/cli/blob/v6.13.6/lib/pack.js#L143
    const tarOpt = {
      file: pkg.destUpdated,
      cwd: pkg.destRepack,
      prefix: 'package/',
      portable: true,
      mtime: new Date('1985-10-26T08:15:00.000Z'),
      gzip: true
    }
    tar.create(tarOpt, fileList, callback)
  })

  const stat = await fs.stat(pkg.destUpdated)
  return stat.size
}

async function getPackgeStats (pkg) {
  await fs.rmdir(pkg.destRepack, { recursive: true })
  await fse.ensureDir(pkg.destRepack)
  await callback2promise((callback) => {
    tar.extract({
      cwd: pkg.destRepack,
      file: pkg.dest
    }, callback)
  })

  const [fileList] = await callback2promise((callback) => {
    glob('**', {
      cwd: pkg.destRepack,
      nodir: true
    }, callback)
  })

  const packageJSONContent = await fs.readFile(pkg.destPackageJSON, 'utf8')
  const packageJSON = JSON.parse(packageJSONContent)

  const stats = {}
  for (const [name, updateFn] of Object.entries(packageJSONUpdate)) {
    stats[name] = await getPackageSize(pkg, fileList, updateFn(packageJSON))
  }
  return stats
}

//
async function main () {
  const args = getArgs()

  // read packages from JSON files
  const pkgs = await getPackages(args.lock, args.dirPackages)

  // download packages
  await applyFn(pkgs, downloadPackage)

  // get package stats
  const stats = await applyFn(pkgs, getPackgeStats)

  // calculate total stats
  const tStats = stats.reduce((total, obj) => {
    for (const key of Object.keys(total)) total[key] += obj[key]
    return total
  })

  // print stats
  const p2s = (v) => `${prettyBytes(v)} (${v})`
  console.log(`noop: ${p2s(tStats.noop)}`)
  console.log(`scripts: ${p2s(tStats.scripts)}, ${p2s(tStats.noop - tStats.scripts)}`)
  console.log(`used: ${p2s(tStats.used)}, ${p2s(tStats.scripts - tStats.used)}, ${p2s(tStats.noop - tStats.used)}`)
}

main().catch((err) => {
  console.error(err.stack || err)
  process.exit(1)
})
