# Node.js: callback when object Garbage Collected

In JavaScript we do not control objects lifetime, instead Garbage Collector remove not used objects for us. JavaScript engine count references to objects, once number of references equal to zero, object marked for removal. If you not familiar with memory management in JS, you can check [Memory Management on mdn](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management) for beginning. One important note here that once object marked for removal it does not means that memory will be released immediately. This only happen when Garbage Collection happened and engine will require memory for allocating new objects (or reduce memory footprint).

But even with removing objects by Garbage Collector we still can be notified about this, unfortunately this only available in [Node.js](https://nodejs.org/) with [C++ addons](https://nodejs.org/api/addons.html).

### MakeWeak and SetWeak

First concept of such way was developed by [Ben Noordhuis](https://github.com/bnoordhuis) as solution for [Node.js issue 631](https://github.com/joyent/node/issues/631) -- https://github.com/bnoordhuis/node-weakref

Solution was create persistent object which have reference to original object and call method [MakeWeak](https://v8docs.nodesource.com/node-0.10/d2/d78/classv8_1_1_persistent.html#a5610d667bc793ba0af838bb134941bec) ([code in node-weakref](https://github.com/bnoordhuis/node-weakref/blob/18b6eca1408ff8c86a1d772aba2df0870ea5d27a/src/weakref.cc#L138-L146)). `MakeWeak` require callback as second argument, which will be called when only _weak_ object will have reference to original object during gc work. Now `MakeWeak` is private API method, so we can not use such way.

Ben provided concept, but [Nathan Rajlich (TooTallNate)](https://github.com/TooTallNate) start maintain it in [node-weak](https://github.com/TooTallNate/node-weak). Idea was same, except that now instead [SetWeak](https://v8docs.nodesource.com/node-12.0/d4/dca/classv8_1_1_persistent_base.html#a9a1e1d92935d6fac29091cff63592854) used instead `MakeWeak` (see call [in code](https://github.com/TooTallNate/node-weak/blob/f222cf78a7d9522cafc60a4f15cf48ebaf7ed3a0/src/weakref.cc#L187)). `SetWeak` have awesome NOTE:

> There is no guarantee as to when or even if the callback is invoked. The invocation is performed solely on a best effort basis. As always, GC-based finalization should not be relied upon for any critical form of resource management! 

For example if your application which uses [V8](https://v8.dev/) (usually Node.js) not manually remove objects after event loop stop, then callback passed to `SetWeak` will be never called.

Also `SetWeak` may potentially make your application crash because call callback JS code in callback, while right approach will call [SetSecondPassCallback](https://v8docs.nodesource.com/node-12.0/d8/d06/classv8_1_1_weak_callback_info.html#a63750d6bc85beb6a093deb7ca0c4c1bf) as [v8 documentation recommend](https://v8docs.nodesource.com/node-12.0/d4/da0/v8_8h_source.html#l00420).

### WeakMap

While `SetWeak` is still working solution, new approach from [Anna Henningsen](https://github.com/addaleax) implemented in [weak-napi](https://github.com/node-ffi-napi/weak-napi) looks much better.

First, new approach use [N-API](https://nodejs.org/api/n-api.html) which not require rebuild bindings each time when v8 version in node changed. Second, instead `SetWeak` native `WeakMap` used, what means 1) callback will be called in a suitable time (no potentially crashed applications) 2) native primitives are used.

So, how it's possible to track object that garbage collected with native `WeakMap`?

First, in C++ bindings persistent function and [ObjectReference](https://github.com/nodejs/node-addon-api/blob/master/doc/object_reference.md) store dead callback and original object. Resulted objected passed to [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy), as result we still can access to original object, but not store any references to it. With newly created object module create simple object in C++ which will call [`OnFree`](https://github.com/node-ffi-napi/weak-napi/blob/v1.0.3/src/weakref.cc#L53) on destructing. `OnFree` itself will call passed callback which means that original object was garbage collected. This new last object will be stored as value in global `WeakMap` where key will be original object.

All this works because once original object garbage collected then value can be removed. Once value removed, destructor of C++ object called and call `OnFree` in its turn. `OnFree` call dead callback and now we in JS know that our object was garbage collected. That's really great idea use all this stuff together.

As example such script can be tested:

```js
// node --expose-gc index.js
const weak = require('weak-napi')

const obj = {}
const ref = weak(obj, () => {
  console.log('"obj" has been garbage collected!')
})

setTimeout(() => {
  global.gc()
}, 100)
```

and result:
```bash
"obj" has been garbage collected!
```
