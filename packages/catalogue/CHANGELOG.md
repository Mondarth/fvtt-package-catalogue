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
