# Why you should not left promises in pending state in Node.js

I think in 2019 nobody need explanation what is [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise), how they should be used, why they was introduced and bla-bla-bla.

I never knew how Promises implemented in V8 and was tried implement something like [Go context](https://golang.org/pkg/context/) in [Node.js](https://nodejs.org/), but this was not successful. In the end I found memory leak in my application and decide learn how Promises works in V8, so I start read soure code.

### Simple loop and memory leak

In my server-side application on which I worked \~1.5 years I used idea of *active* promise which not resolved while applicaiton working and resolved when `SIGINT` or `SIGTERM` received. As result all loops or processes dependent from this *promise* will be finished and application will be gracefully shutdown. For this I used [Promise.race](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race) and loop function was looks like:

```js
function diffTime (time) {
  if (time === undefined) return process.hrtime()

  const diff = process.hrtime(time)
  return diff[0] * 1e3 + diff[1] / 1e6
}

function delay (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms)
}

async function startLoop (fn, activePromise, intervalMax, failsBeforeMax) {
  const interval = Math.ceil(intervalMax / Math.pow(2, failsBeforeMax))
  const sym = Symbol('active deferred')

  for (let loopInterval = interval; ;) {
    const ts = diffTime()

    try {
      const redefined = await Promise.race([activePromise.then(() => sym), fn()])
      switch (result) {
        case sym: return
        case undefined: loopInterval = interval; break
        case null: return
        default: loopInterval = redefined
      }
    } catch (err) {
      loopInterval = Math.min(loopInterval * 2, intervalMax)
    }

    const sleepTime = loopInterval - diffTime(ts)
    if (sleepTime > 0) await Promise.race([activePromise, delay(sleepTime)])
  }
}
```

As you can see from `startLoop` function `activePromise` can be used twice in two different `Promise.race` per one iteration. In first *race* we call `activePromise.then()`, i.e. create new `Promise` from `activePromise` which will be resolved with `sym`. On each iteration.

Service worked with this loop a lot of time, but when I tried implement context package for public usage I go carefully through code and realized that each time I add resolve function to `Promise` which never will be resolved, what this mean? That means that our object growing endlessly. That means that application can use less and less memory with each iteration for other objects and in the end can fail with `out of memory`.

### We need to go deeper

Then I though how *Promise* work in V8? Is `Promise.race` is safe to use? Maybe there some hacks which I can use?

First I was need to find where `Promise` is built in V8, this is done in [src/init/bootstrapper.cc#L2298](https://github.com/nodejs/node/blob/v12.11.0/deps/v8/src/init/bootstrapper.cc#L2298). Here is `Promise.race` lines:

```cpp
    InstallFunctionWithBuiltinId(isolate_, promise_fun, "race",
                                 Builtins::kPromiseRace, 1, true);
```

As we see *Builtins* used, what is this? *Builtins* is a code chunks which executable by the VM at runtime. Thanks to V8 devs they have good article about it: [CodeStubAssembler builtins](https://v8.dev/docs/csa-builtins).

Promise related builtins defined in separate file [src/builtins/builtins-promise-gen.cc](https://github.com/nodejs/node/blob/v12.11.0/deps/v8/src/builtins/builtins-promise-gen.cc), `race` on lines [#L2575-L2706](https://github.com/nodejs/node/blob/v12.11.0/deps/v8/src/builtins/builtins-promise-gen.cc#L2575-L2706).

There a lot of code and if you look on CSA at first time this probably will be not clear. But all this code respect spec [Promise.race in ECMA-262](https://tc39.es/ecma262/#sec-promise.race).

Shorly this will be: `Promise.race` create new `Promise` and receive `resolve` and `reject` functions. Then go through iterable object which was passed, pass value of iteration to `Promise.resolve` and then call `.then` to where pass `resolve` and `reject`. Or rough pseudocode of this will looks like:

```js
function promiseRace (promises) {
  return new Promise((resolve, reject) => {
    for (const promise of promises) {
      Promise.resolve(promise).then(resolve, reject)
    }
  })
}
```

Do you see problem? We call `then` for each promise. On each `Promise.race` V8 call `then`. So if yours promise will not be *resolved* or *rejected* or can not be collected by GC, you receive memory leak with native `Promise.race`. Sounds crazy, but it's reality.

As example of this problem you can run next code:

```js
let resolveUnresolved
const unresolved = new Promise((r) => { resolveUnresolved = r })
const resolved = Promise.resolve(42)

setInterval(() => {
  for (let i = 0; i < 1e5; ++i) {
    Promise.race([unresolved, resolved])
  }

  // const { heapUsed } = process.memoryUsage()
  // if (heapUsed > 500 * 1024 * 1024) resolveUnresolved()
}, 100)
```

Better run it with `--trace-gc`, with tracing you will see how often GC called and how heap size changed after GC. In the end you will receive `out of memory`.

If you uncomment two lines which will cause promise resolving then nearest `Mark-sweep` GC call will decrease heap size to normal value and application will never fail.

### Epilog

While promises made our code easier for writing and understanding other kind of problems was introduced (which in such case depends from implementation!). Be sure that you always resolved your promises or they garbage collected.

And read soure code! Where else you can find that `Promise.all` have limit [2\*\*21-1](https://github.com/nodejs/node/blob/v12.11.0/deps/v8/src/builtins/builtins-promise-gen.cc#L2201-L2207) elements for example?
