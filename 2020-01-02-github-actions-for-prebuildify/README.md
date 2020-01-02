# GitHub Actions for prebuilding Node.js Addons

### Node.js Addons

Node.js Addons well described in [documentation](https://nodejs.org/api/addons.html). In general addons provide an interface between JavaScript and C/C++.

While we can implement a lot of things on JavaScript sometimes it's not wise reinvent the wheel and could be good use already existed libraries. Especially which can be faster, because JavaScript is high-level language with garbage collector. In the end built-in modules are limited with things which you can do in OS. That's why in some cases we need it.

### Addons history

[Addons](https://nodejs.org/api/addons.html) existed in Node.js all time which I remember it (and I used it in June 2013). It's very low level and you need work directly with V8 with some macroses defined by node header. Problem here, that node and V8 are not frozen and change things from time to time, so if you want support more than one version at one time, you will need a lot of `#if` directives and at the end code will be mess.

Obvious solution with supporting more than one version was create some set of macroses. This was done at August 2013 with [NAN](https://github.com/nodejs/nan). And while this is great project some disadvantages exists. First, NAN version can be major bumped and you will have choice, drop old versions or add new ¯\\_(ツ)_/¯. On new V8 release NAN should be updated (if it was fixed to some specific version) and probably you will need update own code. And of course if you change node version on OS, you will need recompile addons, because previously they was compiled for usage other API.

In January 2016 Microsoft created Pull Request [nodejs/node/pull/4765](https://github.com/nodejs/node/pull/4765) which brings [ChakraCore](https://github.com/microsoft/chakracore) to Node.js as V8 alternative. In less than 3 months Pull Request with Node API was created: [nodejs/node/pull/11975](https://github.com/nodejs/node/pull/11975). N-API (Node API) was great idea, because we received additional layer which have stable ABI what means that we do not need recompile our modules between node versions anymore. In future only new things will be added and `NAPI_VERSION` will be increased, but rest still will be here (see [N-API Version Matrix](https://nodejs.org/api/n-api.html#n_api_n_api_version_matrix)).

31 December 2019 was last day when node@8 was supported (see [End-of-Life Releases](https://github.com/nodejs/Release#end-of-life-releases)) and every supported node version have N-API enabled by default (in node@8 it was still experimental feature, required activation by flag). So now we do not need use V8 directly or NAN, all what we need is [N-API](https://nodejs.org/api/n-api.html) (low level) or [node-addon-api](https://github.com/nodejs/node-addon-api) as C++ wrapper around N-API.

### Addons building

Most simplest way is just ship package code with `binding.gyp`, package manager (npm/yarn) will build addon for developers who install package automatically. Problem is that developers should have tools for it, and while in Linux/MacOS a lot of things exists by default, setup building environment in Windows can be not easy job. Of course this will be done on each package installation and should be done again if node version changed. Another point that libraries headers (if they used) should exists, what sometimes require installation of extra packages. Finally, if installation will be run with `--ignore-scripts` (or if this set to `true` globally) nothing will be compiled.

As result tools like [prebuild](https://github.com/prebuild/prebuild) / [prebuildify](https://github.com/prebuild/prebuildify) was created.

Prebuild (Jyly 2016) idea was great, we compile modules for some node versions and upload it to somewhere (GitHub Release Assets usually). When package will be installed, `install` script will check node version and download prebuild addon. In such case we do not need compilation environment. But we sill depend from node version and `install` script.

Prebuildify (January 2017) was improved version of prebuild. Instead uploading prebuild addons we ship it with package itself. As result if required prebuild addon included we can change node version without problem. We also stop depend from `install` script from this moment (if prebuild exists) and a problem that uploaded prebuild can be changed at any time disappeared (we do not have checksum anywhere and not check it on downloading). Interesting thing that installation with downloading all prebuilds in package usually faster than download one version from some place, and usually package managers cache packages, so second installation much faster.

### Building automation

While it's good to have prebuild and prebuildify we need to build our addon somehow. Of course we can do it locally, but in this case we need cross-compilation tool and building for 3 major OS, probably, available only on MacOS. Also, sometimes cross-compilation is just not possible. All this really hard. And every maintainer who make releases should setup this environment.

Obvious thing here is use CI/CD:

  - [Travis CI](https://travis-ci.org/): Linux/MacOS
  - [CircleCI](https://circleci.com/): Linux/Windows (+MacOS with paid subscription)
  - [AppVeyor](https://www.appveyor.com/): Linux/MacOS/Windows
  - [GitHub Actions](https://github.com/features/actions): Linux/MacOS/Windows

I used all of them, each have own advantages and disadvantages, but at current moment for OSS I'd like prefer GitHub Actions.

Looking in the back when [prebuild-ci](https://github.com/prebuild/prebuild-ci) was released we used Travis for Linux/MacOS and AppVeyor for Windows.

### Puzzle solved

So, right now the best choise by my opinion is use `node-addon-api` and `GitHub Actions`. `NAN` does not makes sense for new addons. `GitHub Actions` have only one totally free alternative — `AppVeyor`, but my personal usage experience with it is not good.

<details>
  <summary>GitHub Actions pipeline</summary>

```yaml
name: Build addon, run tests and package

on: [push, pull_request]

jobs:
  build-and-test:
    name: Build addon
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os:
          - macos-latest
          - ubuntu-latest
          - windows-latest
    steps:
      - name: Fetch code
        uses: actions/checkout@v1
        with:
          submodules: true

      - name: Install dependencies
        run: yarn install --ignore-scripts

      - name: Build addon
        run: make build-addon

      - name: Get minimal Node.js version from package.json (Linux & macOS)
        id: node-version-nix
        if: runner.os != 'Windows'
        run: echo "::set-output name=version::$(node -p 'require("./package.json").engines.node.match(/(\d.*)$/)[0]')"

      - name: Use Node.js ${{ steps.node-version-nix.outputs.version }} (Linux & macOS)
        if: runner.os != 'Windows'
        uses: actions/setup-node@v1
        with:
          node-version: ${{ steps.node-version-nix.outputs.version }}

      - name: Get minimal Node.js version from package.json (Windows)
        id: node-version-win
        if: runner.os == 'Windows'
        run: echo "::set-output name=version::$(node -p 'require(\"./package.json\").engines.node.match(/(\d.*)$/)[0]')"

      - name: Use Node.js ${{ steps.node-version-win.outputs.version }} (Windows)
        if: runner.os == 'Windows'
        uses: actions/setup-node@v1
        with:
          node-version: ${{ steps.node-version-win.outputs.version }}

      - name: Run tests for addon
        run: make test-tap

      - name: Upload prebuilds
        uses: actions/upload-artifact@v1
        with:
          name: addon-${{ runner.os }}
          path: prebuilds

  package:
    name: Build package
    needs: build-and-test
    runs-on: ubuntu-latest
    steps:
      - name: Fetch code
        uses: actions/checkout@v1
        with:
          fetch-depth: 1

      - name: Install dependencies
        run: yarn install --ignore-scripts

      - name: Download macOS addon
        uses: actions/download-artifact@v1
        with:
          name: addon-macOS

      - name: Download Linux addon
        uses: actions/download-artifact@v1
        with:
          name: addon-Linux

      - name: Download Windows addon
        uses: actions/download-artifact@v1
        with:
          name: addon-Windows

      - name: Move addons to one folder
        run: mkdir prebuilds && mv ./addon-*/* ./prebuilds/

      - name: list
        run: find prebuilds

      - name: Build package
        run: make package

      - name: Get package version from package.json
        id: pkg-version
        run: echo "::set-output name=version::$(node -p 'require("./package.json").version')"

      - name: Upload package
        uses: actions/upload-artifact@v1
        with:
          name: package
          path: keccak-${{ steps.pkg-version.outputs.version }}.tgz
```
</details>

This is real pipeline from [cryptocoinjs/keccak](https://github.com/cryptocoinjs/keccak/). While we have a lot of steps here, things are simple:

  - build addon on different operating systems
  - save it as artifacts
  - start new job
  - download all compiled addons from previous job
  - build package
  - save package as artifact

All what we need when job is complete is download package and publish it. Whole process is very smooth.

_**Happy addons building in 2020!**_
