# global.gc in Node.js

I think a lot of developers who worked with [Node.js](https://nodejs.org/) know how manually call [GC (Garbage Collector)](https://en.wikipedia.org/wiki/Garbage_collection_(computer_science)): `global.gc()`. By default this function is not available and not part of some standard or Node.js core. If we want it we need run `node` with [V8](https://v8.dev/) option `--expose-gc`, like `node --expose-gc ./my-app.js`.

So we exposed function to `global` Object and now can trigger GC manually, but do we know how this function added to `global` Object and what hidden under `function gc() { [native code] }`? This small note about it.

\* All links to node and V8 will correspond to [v12.10.0](https://github.com/nodejs/node/releases/tag/v12.10.0) (2019-09-03), V8 `7.6.303.29`.

### gc function in global

Before it will be possible call `global.gc` function should be defined, there process:

  - `int main` function defined in [src/node_main.cc#L96](https://github.com/nodejs/node/blob/v12.10.0/src/node_main.cc#L96) and call [node::Start](https://github.com/nodejs/node/blob/v12.10.0/src/node_main.cc#L126).
  - `node::Start` defined in [src/node.cc#997](https://github.com/nodejs/node/blob/v12.10.0/src/node.cc#L997) and call initialize function [InitializeOncePerProcess](https://github.com/nodejs/node/blob/v12.10.0/src/node.cc#L998).
    - `InitializeOncePerProcess` defined in same file [src/node.cc#916](https://github.com/nodejs/node/blob/v12.10.0/src/node.cc#L916) and call [V8::Initialize](https://github.com/nodejs/node/blob/v12.10.0/src/node.cc#L978) (not `v8::Initialize`, `V8` is class in `v8` namespace, so `v8::V8::Initialize`).
    - `V8::Initialize` defined in [deps/v8/src/init/v8.cc#L43](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/v8.cc#L43) and call [InitializeOncePerProcess](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/v8.cc#L44), [InitializeOncePerProcess](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/v8.cc#L109) in own turn call `InitializeOncePerProcessImpl` defined in [same file at L59](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/v8.cc#L59). `InitializeOncePerProcess` contain simple body which have one line with calling function [CallOnce](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/base/once.h#L87) based on `std::atomic`. `InitializeOncePerProcessImpl` do a lot of thing, but we interesting only in [Bootstrapper::InitializeOncePerProcess](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/v8.cc#L104) at L104.
    - `Bootstrapper::InitializeOncePerProcess` implementation defined in [deps/v8/src/init/bootstrapper.cc#L126](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/bootstrapper.cc#L126). As we can see from function body bootstrapper register different `v8::Extension` with `RegisterExtension`, in list we can see `GCExtension`. This is where our `gc` function defined. As you also can noted there function [GCFunctionName](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/bootstrapper.cc#L120) — V8 allows not only export GC function, but also export it under custom name. Option for this `--expose-gc-as`, so command will looks like: `node --expose-gc --expose-gc-as triggerGC ./my-app.js` (and `global.triggerGC` in app). Now there 2 moments:
      - `RegisterExtension` defined in [deps/v8/src/api/api.cc#L945](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/api/api.cc#L945) and call `RegisteredExtension::Register` (also defined there in `api.cc`), which move extension to [singly linked list](https://en.wikipedia.org/wiki/Linked_list#Singly_linked_list).
      - GC Extension defined in `extensions/` subdirectory: [deps/v8/src/extensions/gc-extension.h](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/extensions/gc-extension.h) / [deps/v8/src/extensions/gc-extension.cc](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/extensions/gc-extension.cc). Honestly, when I checked source code I was surprised that function accept one argument, didn't knew about it. We will go through function call in next section.
  - After `V8::Initialize` call in `InitializeOncePerProcess`, `node::Start` create [NodeMainInstance](https://github.com/nodejs/node/blob/v12.10.0/src/node.cc#L1022) ([src/node_main_instance.h#L18](https://github.com/nodejs/node/blob/v12.10.0/src/node_main_instance.h#L18)) and immediately call `NodeMainInstance::Run` ([src/node_main_instance.cc#L95](https://github.com/nodejs/node/blob/v12.10.0/src/node_main_instance.cc#L95)) function.
    - `NodeMainInstance::Run` call own function [CreateMainEnvironment](https://github.com/nodejs/node/blob/v12.10.0/src/node_main_instance.cc#L166) which create `Local<Context>` in both possible scenarios [src/node_main_instance.cc#L179-L185](https://github.com/nodejs/node/blob/v12.10.0/src/node_main_instance.cc#L179-L185). Both ways lead to call private `NewContext` in V8 API: [deps/v8/src/api/api.cc#L5824](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/api/api.cc#L5824).
    - `NewContext` call private `CreateEnvironment` at [L5841](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/api/api.cc#L5841).
    - `CreateEnvironment` create struct `InvokeBootstrapper` and call single function `Invoke` at [lines L5799-L5800](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/api/api.cc#L5799-L5800).
    - `Invoke` located in [deps/v8/src/api/api.cc#L5692](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/api/api.cc#L5692) extract `Bootstrap` instance from `Isolate` and call `CreateEnvironment`.
    - `Bootstrapper::CreateEnvironment` in [deps/v8/src/init/bootstrapper.cc#L300](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/bootstrapper.cc#L300) create `Genesis` (same file [deps/v8/src/init/bootstrapper.cc#L139](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/bootstrapper.cc#L139)). `Genesis` is a helper class for creating `Handle<Context>` and all required things for it. `global` Object is also created there, see [Genesis::CreateNewGlobals at L1161](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/bootstrapper.cc#L1161).
    - When `Genesis` object created `Bootstrapper` call own function [Bootstrapper::InstallExtensions](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/bootstrapper.cc#L5011) which call [Genesis::InstallExtensions](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/bootstrapper.cc#L5065).
    - `Genesis::InstallExtensions` call own function [InstallAutoExtensions](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/bootstrapper.cc#L5086) which iterate over linked list (filled on initialization stage) and call own function [InstallExtension](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/bootstrapper.cc#L5121). Except extensions from linked list other extensions also can be installed, it's depends from passed cmd options (flags) and passed extensions to function `Genesis::InstallExtensions`.
    - `Genesis::InstallExtension` check that passed extension is not installed yet and call itself for dependencies. Finally own function [CompileExtension](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/bootstrapper.cc#L3933) called for extension.
    - Finally `Genesis::CompileExtension` add function to `global` Object at [L3973](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/init/bootstrapper.cc#L3973). This is the most hard part, I do not understand to the end how function added to `Handle<Object>`, if you know, please let me know!

I'd happy attach backtrace here for simplicity, but because some of the functions have `inline` modifier they are skipped.

### global.gc call

Now we know some thing about how `gc` function defined in `global` Object, let's check what happens when we call it.

As we can seen in previous section function implementation located in [deps/v8/src/extensions/gc-extension.cc#L19-L24](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/extensions/gc-extension.cc#L19-L24). It's accept one argument (boolean value, or at least argument which will be converted to boolean) and choose constant based on resulted value. If value will be `true` then `kMinorGarbageCollection` will be used, otherwise `kFullGarbageCollection`. These constants defined in enum `GarbageCollectionType` — [v8.h#L7601-L7604](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/include/v8.h#L7601-L7604)).

There can be a quesiton, why V8 have two different types of Garbage Collector. That's because Garbage Collector in V8 is [Generational](https://en.wikipedia.org/wiki/Garbage_collection_(computer_science)#Generational). There is a young generation (split further into `nursery` and `intermediate` sub-generations), and an old generation. Objects survived GC call moved from first sub-young generation (`nursery`) to second (`intermediate`) and then if they survived on next GC call moved to old generation. Code and some other parts always located in old generation. Young generation is small, usually 1-8MB and this allow very fast GC calls on this generation. I added more links about GC at the end of note.

GC function in extension is simply call `Isolate::RequestGarbageCollectionForTesting`. This function defined in [v8.h#L8194](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/include/v8.h#L8194) too, but if you call it without `--expose-gc` definition application will be aborted. You can read in comments before function definition that `--expose-gc` should be used only for testing (!), because have strong negative impact on the garbage collection performance. Two other functions suggested for influence on the garbage collection schedule: `IdleNotificationDeadline` and `LowMemoryNotification`.

`Isolate::RequestGarbageCollectionForTesting` implemented in [deps/v8/src/api/api.cc#L7876-L7888](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/api/api.cc#L7876-L7888), this function is simple too. There two branches and which will be executed depends from Garbage Collector Type, i.e. young generation or old generation (minor & major). In minor case function `Heap::CollectGarbage` called, see [deps/v8/src/heap/heap.cc#L1370](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/heap/heap.cc#L1370). In major case `Heap::PreciseCollectAllGarbage` called, see [deps/v8/src/heap/heap.cc#L1304](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/heap/heap.cc#L1304), but this function still call `Heap::CollectGarbage` later. The difference between these two calls in first argument, in minor case `NEW_SPACE` will be passed, while in major `OLD_SPACE`. `NEW_SPACE` and `OLD_SPACE` refer to young and old generation respectively. These constants defined in [deps/v8/src/common/globals.h#L718-L735](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/common/globals.h#L718-L735). `PreciseCollectAllGarbage` also have first argument as some flags (`Heap::kNoGCFlags` passed), another value can be `kReduceMemoryFootprintMask` (both values defined in [deps/v8/src/heap/heap.h#L263-L264](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/heap/heap.h#L263-L264)).

Second and third arguments are equal for both functions:
  - Second define reason for GC, which is `GarbageCollectionReason::kTesting`. All constants defined in [deps/v8/src/heap/heap.h#L109-L137](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/src/heap/heap.h#L109-L137).
  - Third argument define GC flags. They defined in [deps/v8/include/v8.h#L6930-L6952](https://github.com/nodejs/node/blob/v12.10.0/deps/v8/include/v8.h#L6930-L6952).

### Examples

Minor & major GC:

```bash
node --trace-gc --expose-gc -e 'global.gc(true);global.gc(false)'
[1207:0x29fe560]       35 ms: Scavenge 2.3 (3.0) -> 1.9 (4.0) MB, 1.2 / 0.0 ms  (average mu = 1.000, current mu = 1.000) allocation failure 
[1207:0x29fe560]       37 ms: Scavenge 1.9 (4.0) -> 1.9 (4.8) MB, 1.3 / 0.0 ms  (average mu = 1.000, current mu = 1.000) testing 
[1207:0x29fe560]       38 ms: Mark-sweep 1.9 (4.8) -> 1.5 (6.8) MB, 1.2 / 0.0 ms  (average mu = 1.000, current mu = 1.000) testing GC in old space requested
```

Here we run `node` with `--trace-gc` which print one trace line following each garbage collection, we also exposed GC function and passed script for evaluation. As result we see two minor GC calls and one major. First minor GC call, probably, was happened because node create internal JS object and this require more than size of young generation space. Then we called minor GC (`global.gc(true)`) and then major GC. For both last two lines we can see reason as `testing`, for major additionally words that GC requested for old space.

Minor & major with mark compact GC for young generation:

```bash
node --trace-gc --expose-gc --minor-mc -e 'global.gc(true);global.gc(false)'
[4739:0x3788650]       55 ms: Minor Mark-Compact 2.3 (3.0) -> 2.0 (4.0) MB, 1.3 / 0.0 ms  (average mu = 1.000, current mu = 1.000) allocation failure 
[4739:0x3788650]       57 ms: Minor Mark-Compact 2.0 (4.0) -> 2.0 (4.8) MB, 1.0 / 0.0 ms  (average mu = 1.000, current mu = 1.000) testing 
[4739:0x3788650]       58 ms: Mark-sweep 2.0 (4.8) -> 1.5 (6.8) MB, 1.2 / 0.0 ms  (average mu = 1.000, current mu = 1.000) testing GC in old space requested
```

This is what confused me in code. Mark-Compact is different algorithm from Scavenge?

There a lot of flags for changing space size and tracing, you can check available with `node --v8-options`.

### Links

Useful articles about Garbage Collector in V8:

  - [Jank Busters Part One](https://v8.dev/blog/jank-busters)
  - [Jank Busters Part Two: Orinoco](https://v8.dev/blog/orinoco)
  - [Orinoco: young generation garbage collection](https://v8.dev/blog/orinoco-parallel-scavenger)
  - [Trash talk: the Orinoco garbage collector](https://v8.dev/blog/trash-talk)
  - [github.com/thlorenz/v8-perf/gc.md](https://github.com/thlorenz/v8-perf/blob/master/gc.md)
