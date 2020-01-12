# The costs of npm-scripts

7-8 years ago, when I started work with [Node.js](https://nodejs.org/en/) build automation tools like [Grunt](https://gruntjs.com/) and [Gulp](https://gulpjs.com/) used almost everywhere, sometimes it was [Make](https://www.gnu.org/software/make/). As time went build automation usage shift from tools to simple [npm-scripts](https://docs.npmjs.com/misc/scripts). And I think it's good, because often we do not need complex things and few simple commands is enough. NPM scripts is good place for them.

In same time I did not seen packages which remove unused `scripts` before package publishing or completely change `package.json`. And now there is a question, how much traffic overhead community receive from storing things in `package.json` and extra `scripts` for package management.

So I write small script for calculate difference. Script accept npm lock file as input and download packages. Each package unpacked and archive size measured for:

- Compressed original files.
- Compressed original files with adjusted `npm-scripts`.
- Compressed original files with adjusted `npm-scripts` and stripped `package.json`.

You can find source code in [stats.js](./stats.js). Before run it, you need install dependencies with `yarn` (`yarn.lock` included).

I though, which packages I should use for tests and decide stop on: [@babel/core](https://www.npmjs.com/package/@babel/core), [browserify](https://www.npmjs.com/package/browserify) and [webpack](https://www.npmjs.com/package/webpack).

And results which I received:

- `@babel/core` (10,866,837 weekly downloads):

```bash
noop: 1.31 MB (1306251)
scripts: 1.31 MB (1305016), 1.24 kB (1235)
used: 1.3 MB (1301408), 3.61 kB (3608), 4.84 kB (4843)
```

- `browserify` (647,447 weekly downloads):

```bash
noop: 1.81 MB (1808257)
scripts: 1.8 MB (1803016), 5.24 kB (5241)
used: 1.79 MB (1793857), 9.16 kB (9159), 14.4 kB (14400)
```

- `webpack` (8,472,388 weekly downloads):

```bash
noop: 5.42 MB (5422115)
scripts: 5.41 MB (5410137), 12 kB (11978)
used: 5.38 MB (5376882), 33.3 kB (33255), 45.2 kB (45233)
```

What all this numbers means? Let's calculate difference for `webpack` as example:

If we remove undocumented `npm-scripts` from `package.json` we save `12 kB (11978 bytes)`. With 8M weekly downlodas this give us: `11,978 * 8,472,388 / 7 / 1024^3 = 13.5 GiB / day`.

If in addition to removing undocumented `npm-scripts` we remove undocumented (plus not required) fields from `package.json` we save `45.2 kB (45233 bytes)`. With 8M weekly downloads this give us: `45,233 * 8,472,388 / 7 / 1024^3 = 50.98 GiB / day`.

All this math is very approximated, becaues part of packages can be cached locally. But numbers really impress, for `webpack` it's roughly `1.5TiB/month` of text which probably not used at all.
