# Package dependents from npmjs.com

Every time when I visited any package page on [npm](https://www.npmjs.com/) I was interested which dependents add more weight in downloads. Finally I decide write simple script which will show it.

Script have zero dependencies and also good demonstration of Node.js [Streams](https://nodejs.org/api/stream.html) and progress bar implemented on [TTY](https://nodejs.org/api/tty.html) (simple version of [node-progress](https://github.com/visionmedia/node-progress)).

I did not found API for fetching dependents, so I checked how npmjs.com works and fetching data from API for web-site. Luckly I found that npm provide API for download statistic and even more, request can be batched up to 128 items. Unfortunately batches still not supported for scoped packages.

Script located in current directory under name [show-dependents.js](./show-dependents.js). Everything what you need to do is just execute it with package name as first argument. For example for package [hash-base](https://www.npmjs.com/package/hash-base):

```bash
./show-dependents.js hash-base
Processed 25 / 31 (80.65%), elapsed: 2.74s
┌─────────┬───────────────────────────────────┬──────────────┐
│ (index) │              package              │  downloads   │
├─────────┼───────────────────────────────────┼──────────────┤
│    0    │            'ripemd160'            │ '25,705,386' │
│    1    │             'md5.js'              │ '25,215,484' │
│    2    │       'react-misc-toolbox'        │    '156'     │
│    3    │      'responsive-react-app'       │    '130'     │
│    4    │             'webche'              │    '115'     │
│    5    │        'iris-embedded-sdk'        │     '96'     │
│    6    │       'react-input-select'        │     '57'     │
│    7    │          'viber-botkit'           │     '25'     │
│    8    │         'carousel-react'          │     '22'     │
│    9    │        'search-list-react'        │     '18'     │
│   10    │       'search-input-react'        │     '18'     │
│   11    │       'canvas-fingerprint'        │     '17'     │
│   12    │       'a_react_reflux_demo'       │     '15'     │
│   13    │   '@ngxvoice/ngx-voicelistner'    │     '13'     │
│   14    │ '@southcn/ckeditor5-build-inline' │     '12'     │
│   15    │     'digital-keyboard-demos'      │     '12'     │
│   16    │              'fhir2'              │     '10'     │
│   17    │        'iris-node-js-sdk'         │     '10'     │
│   18    │        'react-redux-demo1'        │     '10'     │
│   19    │    'miguelcostero-ng2-toasty'     │     '10'     │
│   20    │            'freemamba'            │     '8'      │
│   21    │           'outils-ren'            │     '8'      │
│   22    │      '@ericmcornelius/ease'       │     '6'      │
│   23    │            'lrbceshi'             │     '6'      │
│   24    │          'vue-compment'           │     '5'      │
└─────────┴───────────────────────────────────┴──────────────
```

As you can probably noted, indexed number of packages is different from total number... I'm not sure why npmjs.com show total number bigger than number of dependents, probably because private packages exists?
