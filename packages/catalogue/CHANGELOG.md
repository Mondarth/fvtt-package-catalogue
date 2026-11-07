## [@mondarth/fvtt-package-catalogue-v0.7.0](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.6.4...@mondarth/fvtt-package-catalogue-v0.7.0) (2026-11-07)

### Features

* **catalogue:** retire version 1 of the API ([ee12fdc](https://github.com/Mondarth/fvtt-package-catalogue/commit/ee12fdc5ba6728bb887453300a6423e933978e8e))
* **contract:** retire version 1 of the API ([96fcd28](https://github.com/Mondarth/fvtt-package-catalogue/commit/96fcd28f7ed0da3beb38ed101b7acccf2f0733aa))

### Bug Fixes

* **worker:** crawl archived packages, as manifests still give them ([28d0ad0](https://github.com/Mondarth/fvtt-package-catalogue/commit/28d0ad05eda636d15e247c2a11da3c28732e304b))

## [@mondarth/fvtt-package-catalogue-v0.6.4](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.6.3...@mondarth/fvtt-package-catalogue-v0.6.4) (2026-11-06)

### Bug Fixes

* **catalogue:** load versions written with fewer zeros, or IDs cased ([35e9460](https://github.com/Mondarth/fvtt-package-catalogue/commit/35e94602533c62d5d33511ce4150af2f7bb5e388))
* **worker:** crawl again soon what could not be fetched for a while ([e2dafc2](https://github.com/Mondarth/fvtt-package-catalogue/commit/e2dafc2248cb72dc82889dfa74edd092d9c513cd))

## [@mondarth/fvtt-package-catalogue-v0.6.3](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.6.2...@mondarth/fvtt-package-catalogue-v0.6.3) (2026-11-06)

### Bug Fixes

* **catalogue:** take no other package's tags from a shared repository ([05fb87e](https://github.com/Mondarth/fvtt-package-catalogue/commit/05fb87e08927688e60a1fc7d689dc620bccc903b))

## [@mondarth/fvtt-package-catalogue-v0.6.2](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.6.1...@mondarth/fvtt-package-catalogue-v0.6.2) (2026-11-06)

### Bug Fixes

* **catalogue:** leave out versions guessed from tags that never load ([bfbefc6](https://github.com/Mondarth/fvtt-package-catalogue/commit/bfbefc61e9a69cefd4e32d2fd9be18b80ff9b44b))

## [@mondarth/fvtt-package-catalogue-v0.6.1](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.6.0...@mondarth/fvtt-package-catalogue-v0.6.1) (2026-11-05)

### Bug Fixes

* **worker:** compare with the index only once its copy holds it ([e8f7074](https://github.com/Mondarth/fvtt-package-catalogue/commit/e8f70749f35cb8f9ba0ba24582adcaf8b1ecd278))

## [@mondarth/fvtt-package-catalogue-v0.6.0](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.5.3...@mondarth/fvtt-package-catalogue-v0.6.0) (2026-11-05)

### Features

* **catalogue:** answer version 2 lookups ([418e079](https://github.com/Mondarth/fvtt-package-catalogue/commit/418e0795f70786eb86e06c0365f817ea3cec2bb3))
* **catalogue:** give the listing and builds, revalidated by ETag ([e472730](https://github.com/Mondarth/fvtt-package-catalogue/commit/e472730d9314763614a76a5a1f54d12ea6733c58))
* **catalogue:** keep a copy of Foundry VTT's package index ([00f7a75](https://github.com/Mondarth/fvtt-package-catalogue/commit/00f7a75e82916c5f6218013771d3adb08ab06ca0))
* **catalogue:** read manifest URLs users give, refusing private ones ([d2c301c](https://github.com/Mondarth/fvtt-package-catalogue/commit/d2c301ccb3d6bbc5a1270370b5f460828bc891c8))
* **catalogue:** recheck packages' own manifests when asked ([070b024](https://github.com/Mondarth/fvtt-package-catalogue/commit/070b024a362069cfcbbadf968f1ed4461bb83d19))
* **worker:** check own manifests hourly and keep what they gave ([6a19078](https://github.com/Mondarth/fvtt-package-catalogue/commit/6a19078c7bf0461ebb313dd21c5e509b695cdfbb))
* **worker:** compare the catalogue with the index daily ([eb9a46d](https://github.com/Mondarth/fvtt-package-catalogue/commit/eb9a46d95291daee0ac7882fe266bd5a7bf40706))
* **worker:** crawl several packages at once, limited per host ([2d1a175](https://github.com/Mondarth/fvtt-package-catalogue/commit/2d1a1751f548b16d750bfd4ba3e0614e630a51a8))
* **worker:** warm the catalogue with every package the index lists ([918b225](https://github.com/Mondarth/fvtt-package-catalogue/commit/918b2257f90dfb41fb398d7cf8266411d94704e1))

### Bug Fixes

* **worker:** bound the worker's cache of what it fetched ([4df6aa0](https://github.com/Mondarth/fvtt-package-catalogue/commit/4df6aa08f9e6c0e115c3075d2756fcf6680b8c71))

## [@mondarth/fvtt-package-catalogue-v0.5.3](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.5.2...@mondarth/fvtt-package-catalogue-v0.5.3) (2026-11-05)

### Bug Fixes

* **catalogue:** read the index's last_updated as a time ([77a61de](https://github.com/Mondarth/fvtt-package-catalogue/commit/77a61ded065699abfc121db17591f17142334b2c))

### Build System

* **deps-dev:** Bump @electric-sql/pglite ([ed1274f](https://github.com/Mondarth/fvtt-package-catalogue/commit/ed1274fc4a975221290521f2db2647c548b60cd0))
* **deps-dev:** Bump @inlang/paraglide-js from 2.29.1 to 2.29.3 ([2d99a5a](https://github.com/Mondarth/fvtt-package-catalogue/commit/2d99a5a80933ef4f3b94e90fad4856ba4cd8fbb4))
* **deps-dev:** Bump the database group across 1 directory with 2 updates ([6133ecd](https://github.com/Mondarth/fvtt-package-catalogue/commit/6133ecd78c40df96c66dfb97eede4e1d15cf93ca))
* **deps-dev:** Bump the svelte group across 1 directory with 3 updates ([4b054db](https://github.com/Mondarth/fvtt-package-catalogue/commit/4b054dbd562a24db1e89e99cec350f02e1f790bc))

## [@mondarth/fvtt-package-catalogue-v0.5.2](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.5.1...@mondarth/fvtt-package-catalogue-v0.5.2) (2026-11-03)

### Bug Fixes

* **worker:** hold the version a package's own manifest gives now ([d0c3609](https://github.com/Mondarth/fvtt-package-catalogue/commit/d0c360979fb7133bb97a4a08acd3e5bc0e29eb98))
* **worker:** skip a manifest naming its version as a package's own ([86aa0f5](https://github.com/Mondarth/fvtt-package-catalogue/commit/86aa0f51befa6cc84ecc06b30270aa332c0610c0))

## [@mondarth/fvtt-package-catalogue-v0.5.1](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.5.0...@mondarth/fvtt-package-catalogue-v0.5.1) (2026-11-02)

### Bug Fixes

* **worker:** remove a release held that is gone and was never loaded ([7b3be90](https://github.com/Mondarth/fvtt-package-catalogue/commit/7b3be905b6b06f9e237d616f2bdade40ef3d2a13))

### Build System

* **deps:** bump @mondarth/fvtt-resolver to 0.9.1 ([74cc538](https://github.com/Mondarth/fvtt-package-catalogue/commit/74cc53819f66a894f331e09a3ab871b34f9d899e))

## [@mondarth/fvtt-package-catalogue-v0.5.0](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.4.1...@mondarth/fvtt-package-catalogue-v0.5.0) (2026-11-01)

### Features

* **worker:** add a recrawl command that queues every package held ([1da1cb0](https://github.com/Mondarth/fvtt-package-catalogue/commit/1da1cb01d4bf28bb1bba74823b3acc348a407f9b))

### Bug Fixes

* **catalogue:** give a release held the manifest URL it lacked ([b685bfb](https://github.com/Mondarth/fvtt-package-catalogue/commit/b685bfb738ca9c9ee52a8af20b864f9b22ad9752))

## [@mondarth/fvtt-package-catalogue-v0.4.1](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.4.0...@mondarth/fvtt-package-catalogue-v0.4.1) (2026-11-01)

### Build System

* **deps:** bump @mondarth/fvtt-resolver to 0.9.0 ([0c587a9](https://github.com/Mondarth/fvtt-package-catalogue/commit/0c587a97dc7522bb4690bb0ca328aebcae2f8105))

## [@mondarth/fvtt-package-catalogue-v0.4.0](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.3.0...@mondarth/fvtt-package-catalogue-v0.4.0) (2026-10-27)

### Features

* **catalogue:** leave archived and gone packages uncrawled, and say so ([33b186e](https://github.com/Mondarth/fvtt-package-catalogue/commit/33b186e186263e061cd5b25265032cd5a96e8b80))
* **catalogue:** read package overrides for sources that mislead it ([1e3fb5c](https://github.com/Mondarth/fvtt-package-catalogue/commit/1e3fb5c12429b3cccb269788a507377af02c32eb))

## [@mondarth/fvtt-package-catalogue-v0.3.0](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.2.0...@mondarth/fvtt-package-catalogue-v0.3.0) (2026-10-26)

### Features

* **catalogue:** keep releases newer than the listing, marked unlisted ([6e1e476](https://github.com/Mondarth/fvtt-package-catalogue/commit/6e1e476013e688780c09b5bb95dc0f655cd6bd79))

## [@mondarth/fvtt-package-catalogue-v0.2.0](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.1.0...@mondarth/fvtt-package-catalogue-v0.2.0) (2026-10-24)

### Features

* **catalogue:** crawl again the packages that changed ([d07bc8e](https://github.com/Mondarth/fvtt-package-catalogue/commit/d07bc8e44feb9164655146b9e44e16b40b706003))
* **catalogue:** crawl the queue and keep core builds with the worker ([bbad719](https://github.com/Mondarth/fvtt-package-catalogue/commit/bbad7198fb471028a5826223d714c3baa9d7409f))
* **catalogue:** serve the universe of a set of packages ([aa630cf](https://github.com/Mondarth/fvtt-package-catalogue/commit/aa630cf230b065f00325802cd1895ff86d88b102))

## [@mondarth/fvtt-package-catalogue-v0.1.0](https://github.com/Mondarth/fvtt-package-catalogue/compare/@mondarth/fvtt-package-catalogue-v0.0.0...@mondarth/fvtt-package-catalogue-v0.1.0) (2026-10-24)

### Features

* **catalogue:** serve releases and status from postgresql ([fdc4822](https://github.com/Mondarth/fvtt-package-catalogue/commit/fdc482204d62dcf6e90256d1cad9b9a6e61beb3a))

### Bug Fixes

* **catalogue:** add the releases endpoint the ignore rules kept out ([6790e51](https://github.com/Mondarth/fvtt-package-catalogue/commit/6790e516c613d789184632e1dbe680bcd2ba1bea))
* **catalogue:** compare api keys without hashing them ([be5b1ea](https://github.com/Mondarth/fvtt-package-catalogue/commit/be5b1ea0e5aca3c2b6b8d66b56e145e6ae411231))
