# perf_hooks in Node.js

While `Performance Timing API` — [perf_hooks](https://nodejs.org/api/perf_hooks.html) (docs for [v12.10.0](https://nodejs.org/docs/v12.10.0/api/perf_hooks.html)) was added to Node.js almost two years ago ([github.com/nodejs/node/pull/14680](https://github.com/nodejs/node/pull/14680)) but I even did not checked what this module provide. When I looked through docs I did not found detailed examples and wanted dive more to Garbage Collector, so this note is set of examples for each `entryType` in `perf_hooks`.

Module is still `Experimental` (see [Stability Index](https://nodejs.org/api/documentation.html#documentation_stability_index)), so everything will be valid for [v12.10.0](https://github.com/nodejs/node/tree/v12.10.0), links will point on code for this version.

  - [node](#node)
  - [mark & measure](#mark--measure)
  - [function](#function)
  - [http](#http)
  - [http2](#http2)
  - [gc](#gc)

#### node

`PerformanceEntry` with type `node` is special entry, you can not receive it through observer, because it's already defined and available as property through `getter`. This entry is singleton class.

From this entry we can receive duration in milliseconds which was required for finishing action (i.e. `milestone`). Currently we have access to 6 milestones. They perfectly described in [docs](https://nodejs.org/docs/v12.10.0/api/perf_hooks.html#perf_hooks_class_performancenodetiming_extends_performanceentry) ([code](https://github.com/nodejs/node/blob/v12.10.0/lib/perf_hooks.js#L154)).

```js
{
  name: 'node',
  entryType: 'node',
  startTime: 0,
  duration: 53.86693799495697,
  nodeStart: 0.279431015253067,
  v8Start: 2.476245015859604,
  bootstrapComplete: 43.5908420085907,
  environment: 11.12601301074028,
  loopStart: 49.44547098875046,
  loopExit: 49.459022015333176,
  thirdPartyMainStart: undefined,
  thirdPartyMainEnd: undefined,
  clusterSetupStart: undefined,
  clusterSetupEnd: undefined,
  moduleLoadStart: undefined,
  moduleLoadEnd: undefined,
  preloadModuleLoadStart: undefined,
  preloadModuleLoadEnd: undefined
}
```

Full code available in [examples/node.js](./examples/node.js)

In version 12.10.0 we can see other fields, but milestones for this keys were removed [github.com/nodejs/node/pull/21247](https://github.com/nodejs/node/pull/21247), but keys still in inspect function. I created PR for removing it, so probably this will fixed soon ([github.com/nodejs/node/pull/29528](https://github.com/nodejs/node/pull/29528)).

#### mark & measure

`mark` and `measure` one of the simplest entry types in `perf_hooks`. Idea is simple, we create mark on timeline for some name, create another mark and then measure difference between. For example, we create mark `A`, then run some function, create mark `B` then measure time between two marks, we can see such both `mark` & `measure` in [PerformanceObserver
](https://nodejs.org/docs/v12.10.0/api/perf_hooks.html#perf_hooks_class_performanceobserver) callback:

```js
{"name":"A","entryType":"mark","startTime":45.925918,"duration":0}
{"name":"B","entryType":"mark","startTime":116.494052,"duration":0}
{"name":"A to B","entryType":"measure","startTime":45.925918,"duration":70.568134}
```

Full code available in [examples/mark-measure.js](./examples/mark-measure.js)

#### function

Instead using `mark` & `measure` for synchronous functions we can use `timerify` which produce `function` entry type. But this valid only for synchronous functions, for async we still need use `mark`/`measure`.

`timerify` cache resulted function as property in original function, so each time we will result same object: [perf_hooks.js#L415-L423](https://github.com/nodejs/node/blob/v12.10.0/lib/perf_hooks.js#L415-L423).

Under the hood before and after original function call code get current time, so this should be faster than `mark` & `measure`: [node_perf.cc#L322-L338](https://github.com/nodejs/node/blob/v12.10.0/src/node_perf.cc#L322-L338).

```js
{"name":"doSomeWork","entryType":"function","startTime":34.94268,"duration":65.832449}
```

Full code available in [examples/function.js](./examples/function.js)

#### http

HTTP Server in Node.js use `perf_hooks` for emitting duration of handling HTTP request. Duration will be time between creating ServerResponse and `ServerResponse#_finish` call. In source: [lib/\_http_server.js#L161-L175](https://github.com/nodejs/node/blob/v12.10.0/lib/_http_server.js#L161-L175) & [lib/internal/http.js#L31-L45](https://github.com/nodejs/node/blob/v12.10.0/lib/internal/http.js#L31-L45). Because `perf_hooks` works only when observers for `http` added, without it this should give zero overhead for HTTP Server with code for `perf_hooks`.

```js
{"name":"HttpRequest","entryType":"http","duration":0.740417,"startTime":215104781.282011}
```

Full code available in [examples/http.js](./examples/http.js)

#### http2

HTTP2 is more complex than HTTP. In [http2](https://nodejs.org/docs/v12.10.0/api/http2.html) we have [Http2Session](https://nodejs.org/docs/v12.10.0/api/http2.html#http2_class_http2session) and [Http2Stream](https://nodejs.org/docs/v12.10.0/api/http2.html#http2_class_http2stream), one Session can have many Streams. Observer which subscribed to `http2` will have entry for each Session and Stream. While `http` type available only for ServerResponse now, `http2` type available for both client and server.

Node.js docs also have good description fields of such entries: https://nodejs.org/docs/v12.10.0/api/http2.html#http2_collecting_http_2_performance_metrics

```js
{"name":"Http2Stream","entryType":"http2","startTime":56.851517,"duration":3.810295,"id":1,"timeToFirstByte":0,"timeToFirstHeader":226649758.667291,"timeToFirstByteSent":226649761.046063,"bytesWritten":2,"bytesRead":0}
{"name":"Http2Stream","entryType":"http2","startTime":56.303171,"duration":4.960001,"id":1,"timeToFirstByte":0,"timeToFirstHeader":226649762.293621,"timeToFirstByteSent":0,"bytesWritten":0,"bytesRead":2}
{"name":"Http2Session","entryType":"http2","startTime":55.990767,"duration":5.992484,"type":"client","pingRTT":0,"framesReceived":5,"framesSent":5,"streamCount":1,"streamAverageDuration":4.960001,"bytesWritten":100,"bytesRead":72,"maxConcurrentStreams":1}
{"name":"Http2Session","entryType":"http2","startTime":55.001057,"duration":9.796909,"type":"server","pingRTT":0,"framesReceived":4,"framesSent":7,"streamCount":1,"streamAverageDuration":3.810295,"bytesWritten":106,"bytesRead":100,"maxConcurrentStreams":1}
```

Full code available in [examples/http2.js](./examples/http2.js)

#### gc

Probably most hard entry type for understanding is `gc`. Under hard I mean understanding what field [kind](https://nodejs.org/docs/v12.10.0/api/perf_hooks.html#perf_hooks_performanceentry_kind) means.

Constants `NODE_PERFORMANCE_GC_*` exported from V8: [src/node_perf.h#L104-L109](https://github.com/nodejs/node/blob/v12.10.0/src/node_perf.h#L104-L109). Currently with values:

  - `NODE_PERFORMANCE_GC_MAJOR` = `GCType::kGCTypeMarkSweepCompact` = 2
  - `NODE_PERFORMANCE_GC_MINOR` = `GCType::kGCTypeScavenge` = 1
  - `NODE_PERFORMANCE_GC_INCREMENTAL` = `GCType::kGCTypeIncrementalMarking` = 4
  - `NODE_PERFORMANCE_GC_WEAKCB` = `GCType::kGCTypeProcessWeakCallbacks` = 8

From names it's obvious that `MAJOR` is gc call for old generation, `MINOR` gc call for young generation. Garbage Collector uses marking for checking which objects alive, but run marking on big heap is like stop the world for few hundred milliseconds, because this `INCREMENTAL` marking was implemented which is set of few small marking calls (see details in [A tour of V8: Garbage Collection](http://jayconrod.com/posts/55/a-tour-of-v8-garbage-collection) — `Incremental marking and lazy sweeping`). Finally, last `gc` kind now is `WEAKCB`: when we make Object derived from `PersistentBase` in addons weak with `SetWeak` call, we can pass callback which will be called when Object will be Garbage Collected. Thing is, that no other v8 api can be called in this callback, so we can set another (second) callback which will be called later — this will produce `WEAKCB`. [SetSecondPassCallback](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/include/v8.h#L421-L427) in `v8.h`.

```js
MyStructCallback1
{"name":"gc","entryType":"gc","startTime":54.537262,"duration":0.237857,"kind":1}
{"name":"gc","entryType":"gc","startTime":55.275977,"duration":0.021478,"kind":4}
MyStructCallback2
{"name":"gc","entryType":"gc","startTime":57.155068,"duration":0.383058,"kind":2}
{"name":"gc","entryType":"gc","startTime":63.663558,"duration":0.061706,"kind":4}
{"name":"gc","entryType":"gc","startTime":66.752791,"duration":0.655389,"kind":2}
{"name":"gc","entryType":"gc","startTime":67.479331,"duration":0.000318,"kind":8}
```

Full code available in [examples/gc.js](./examples/gc.js)

This example also require building addon, because without it we can not receive `NODE_PERFORMANCE_GC_WEAKCB` gc kind. We also need run script with flags `--expose-gc` & `--stress-incremental-marking` because need `global.gc` for Scavenge and need force `NODE_PERFORMANCE_GC_INCREMENTAL` without big heap size. Order of GC calls can be different for you, but you should see each kind.
