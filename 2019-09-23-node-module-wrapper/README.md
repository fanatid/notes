# Module wrapper in Node.js

All this years which I code on JavaScript I had never though what is `require` / `module` / `__filename` / `__dirname` in [Node.js](https://nodejs.org/). They just work. I know that I can export things with `export` Object or redefine it with `module.exports`, knew that `__filename` is path to current file and `__dirname` is directory of `__filename`. In additional to `require` I used function `resolve` sometimes. That's all. Now looking in past I think it's a shame, but we can not know everything and learning all the time. In this short note I'd like to share my new knowledge.

First we can start from [Node.js Documentation](https://nodejs.org/api/documentation.html), while we can use it all the time for checking how different functions works, some topics can be ignored because not required right now for our tasks. Modules can be one of such topics, but they actually described in docs: https://nodejs.org/api/modules.html

Why modules? Because each file in Node.js is threated as separate module. Modules documentation have interesting section [The module wrapper](https://nodejs.org/api/modules.html#modules_the_module_wrapper), from where we can learn that code in files wrapped to function wrapper:

```js
(function(exports, require, module, __filename, __dirname) {
// Module code actually lives in here
});
```

Now it's clear why global variables defined in files not available from other files. Wrapping in Node.js code defined in [cjs/loader.js#L859-L868](https://github.com/nodejs/node/blob/v12.10.0/lib/internal/modules/cjs/loader.js#L859-L868). Wrapped code compiled with [vm](https://nodejs.org/api/vm.html) module, but this happened only if some `patched` variable set to `true`. Otherwise `CompileFunctionInContext` from V8 used.

Not only `wrap` exported through `module.wrap`, but also lines for wrapping function as variable `wrapper`. This better explain in code: [cjs/loader.js#L180-L200](https://github.com/nodejs/node/blob/v12.10.0/lib/internal/modules/cjs/loader.js#L180-L200) You also can find here that `patched` changed to `true` once we change `wrap` or `wrapper`.

We can change both `wrap` and `wrapper`, for example we can measure how much time required for execute code in file:

```js
const mod = require('module')
mod.wrapper[0] = mod.wrapper[0] + 'require("perf_hooks").performance.mark(__filename + "_start");'
mod.wrapper[1] = 'require("perf_hooks").performance.mark(__filename + "_end");require("perf_hooks").performance.measure(__filename, __filename + "_start", __filename + "_end");' + mod.wrapper[1]

const { performance, PerformanceObserver } = require('perf_hooks')
const observer = new PerformanceObserver((items) => {
  const entry = items.getEntries()[0]
  console.log(`${entry.entryType} => ${entry.duration}`)
});
observer.observe({ entryTypes: ['measure', 'function'] })

performance.timerify(require)('./some-file')
``` 

where `some-file.js` can be:

```js
const http = require('http')
```

result on my machine:

```bash
measure => 3.841967
function => 8.28471
```

`measure` means how much time was need for execute code in file, while `function` means total time spent by `require`.

Another example can be modify `wrapper` in such way, that all code will be executed in strict mode: [isaacs/use-strict](https://github.com/isaacs/use-strict)
