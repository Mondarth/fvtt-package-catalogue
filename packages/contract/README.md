# @mondarth/fvtt-package-catalogue-contract

The API contract of the [Foundry VTT package catalogue](https://github.com/Mondarth/fvtt-package-catalogue): a [zod](https://zod.dev) schema, and its TypeScript type, for every request and response of the catalogue's API.

> **Not ready for use.** Releases before 1.0.0 may change anything.

The catalogue validates every answer it sends against these schemas, and clients validate what they receive with the same ones. The data is shaped as [`@mondarth/fvtt-resolver`](https://www.npmjs.com/package/@mondarth/fvtt-resolver) reads it: a `Release` from the API is a resolver `Release`, which the package's type tests prove.

```ts
import { API_KEY_HEADER, ReleasesResponse, releasesPath } from '@mondarth/fvtt-package-catalogue-contract';

const response = await fetch(new URL(releasesPath({ type: 'module', id: 'midi-qol' }), base), {
  headers: { [API_KEY_HEADER]: key },
});
const { releases } = ReleasesResponse.parse(await response.json());
```

A universe, for the resolver, is posted:

```ts
import { API_KEY_HEADER, UNIVERSE_PATH, UniverseResponse } from '@mondarth/fvtt-package-catalogue-contract';

const response = await fetch(new URL(UNIVERSE_PATH, base), {
  method: 'POST',
  headers: { [API_KEY_HEADER]: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ packages: [{ type: 'module', id: 'midi-qol' }] }),
});
const { universe, pending } = UniverseResponse.parse(await response.json());
```

## Licence

MIT

## AI Disclosure

This package is developed with AI assistance (Claude Code). All changes are reviewed by a human before they are merged.
