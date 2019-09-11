# uvthreads sync vs async in Node.js

Yesterday, while I watched `A Journey into Node.js Internals` by `Tamar Twena-Stern` I realized how her example of profiling Node.js is good for demonstrating thread pool in [Node.js](https://nodejs.org/).

Record of talk on YouTube (from 18:52): https://youtu.be/LbwUETu7Rgc?t=1132

While speaker talking about profiling and blocking event loop, I want take attention on parallelization. Code:

```js
const crypto = require('crypto')

;(async () => {
  const count = 1e2
  const async = () => new Promise((resolve) => crypto.pbkdf2('secret', 'salt', 1e5, 64, 'sha256', () => resolve()))
  const sync = () => crypto.pbkdf2Sync('secret', 'salt', 1e5, 64, 'sha256')

  console.time('async')
  await Promise.all(new Array(count).fill(null).map(() => async()))
  console.timeEnd('async')

  console.time('sync')
  for (let i = 0; i < count; ++i) sync()
  console.timeEnd('sync')
})()
```

Maybe this will be surprised for somebody, but result (CPU `i5-8250U`):

```bash
$ node test.js
async: 2680.411ms
sync: 10029.770ms
```

Why async 4x times faster? Because async version of `pbkdf2` works in libuv threads. By default we have 4 threads. My CPU have 4 cores (8 vCPU), so each thread work on own CPU and we receive acceleration.

With changed thread pool size:

```bash
$ UV_THREADPOOL_SIZE=2 node test.js
async: 4998.330ms
sync: 9904.204ms
$ UV_THREADPOOL_SIZE=6 node test.js
async: 2622.291ms
sync: 9898.255ms
```

Interesting, that increasing number of threads to 6 not improved result compare to 4 threads. I guess that this because crypto accelerator available per CPU, i.e. one per two vCPUs.
