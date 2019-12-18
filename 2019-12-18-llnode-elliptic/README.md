# JavaScript, sometimes, is not your friend

Everybody know that JavaScript have Garbage Collector. From one side this is a great feature, which allow us write code faster, from other side we can not control memory manually. This can have some unpleasant consequences, for example with cryptography operations. How many people thought about what happens with objects where they kept sensitive data?

### elliptic and llnode

[indutny/elliptic](https://github.com/indutny/elliptic) is great library, really. Used in a lot of applications and by [npmjs](https://www.npmjs.com/package/elliptic) stats have more than 7M downloads per week!

So it will be good to show, how some private keys can be restored. For this we will use [nodejs/llnode](https://github.com/nodejs/llnode) what is C++ plugin for LLDB debugger. `llnode` currently node work on node@12, so you need use 10 or lower.

For demo I create small HTTP server ([server.js](server.js)), which on request:

  - [Random KeyPair generated](https://github.com/indutny/elliptic/blob/v6.5.2/lib/elliptic/ec/index.js#L54)
  - Private and Public keys printed to stdout
  - Public key sent to client
  - Call `setTimeoutglobal.gc, 100)` for collecting not used objects

By code, it's looks like that KeyPair should be collected by GC and nothing should be left in Node.js heap. But let's check!

You can run server with command (of course you need install dependencies first: `yarn install`):

```bash
$ node --expose-gc server.js
```

and now you can make few requests to `localhost:8000`:

```bash
$ for (( a = 1; a < 10; a++ )); do curl localhost:8000; done
```

As result you will see something like this in stdout by `server.js`:

```bash
Server at localhost:8000 (pid: 10321)
b5d9d042530476b0d732e75cab8a209d544a3fad4a5d9dd3d8e321232eb2c065 => 038274d363bc754ddd7ed21b295945363e01e4d85e8de983addc6818073d6935c4
5dc10a253e6de5abaad396aa460f6a27f4af6400602c7e59978fb5a02a6d2ffc => 025f6cb9747ada6fc7c81c2baa68e47f088a9161bca806773b0dba3bcdc1259803
...
d924065526f565c7902737459adb621cbfd6f113849b9a85056c9e80d81e5ac4 => 0310baa0d3c4375e8407941812f6ed88b029867ea76b33dfea0d25a58fb5727c98
```

and only public keys in terminal where cURL was called:

```bash
038274d363bc754ddd7ed21b295945363e01e4d85e8de983addc6818073d6935c4
025f6cb9747ada6fc7c81c2baa68e47f088a9161bca806773b0dba3bcdc1259803
...
0310baa0d3c4375e8407941812f6ed88b029867ea76b33dfea0d25a58fb5727c98
```

Now, we need generate core file by [gcore](http://man7.org/linux/man-pages/man1/gcore.1.html):

```bash
$ gcore 10321
[New LWP 10322]
[New LWP 10323]
[New LWP 10324]
[New LWP 10325]
[New LWP 10326]
[New LWP 10327]
[Thread debugging using libthread_db enabled]
Using host libthread_db library "/lib64/libthread_db.so.1".
0x00007f995ca692c6 in epoll_pwait () from /lib64/libc.so.6
warning: target file /proc/10321/cmdline contained unexpected null characters
Saved corefile core.10321
[Inferior 1 (process 10321) detached]
```

Great, now we can try find private keys by public keys. It's very simple, everything what you need is run [llnode.js](llnode.js) script:

```bash
$ node llnode.js core.10321 038274d363bc754ddd7ed21b295945363e01e4d85e8de983addc6818073d6935c4
Found 0 KeyPair instances.
Found 970 BN instances.
$ node llnode.js core.10321 0310baa0d3c4375e8407941812f6ed88b029867ea76b33dfea0d25a58fb5727c98
Found 0 KeyPair instances.
Found 970 BN instances.
Found private key for given public key!
d924065526f565c7902737459adb621cbfd6f113849b9a85056c9e80d81e5ac4 => 0310baa0d3c4375e8407941812f6ed88b029867ea76b33dfea0d25a58fb5727c98
```

Yes, GC removed all keys except last, but we forced this call. Do we always call call `global.gc()` when we do not need sensitive data anymore?

Sometimes, lack of access to memory management is bad.

### How things can be solved?

In Node.js most likely is no way to solve it. Probably, if you move data processing to [addon](https://nodejs.org/api/addons.html) it will help.

If you need only Buffer, good way use Memory Protection from [sodium-friends/sodium-native](https://github.com/sodium-friends/sodium-native#memory-protection). Which is addon to libsodium.

[jedisct1/libsodium](https://github.com/jedisct1/libsodium) have [Secure memory](https://download.libsodium.org/doc/memory_management) which result of:

  - [madvise](http://man7.org/linux/man-pages/man2/madvise.2.html) with `MADV_DONTDUMP` which exclude memory segment from core file
  - [mlock](http://man7.org/linux/man-pages/man2/mlock.2.html) which disable swapping memory segment
  - [mprotect](http://man7.org/linux/man-pages/man2/mprotect.2.html) as guard pages
