import type { HttpClient } from '@mondarth/fvtt-resolver/sources';
import type { Logger } from '#lib/server/log.js';
import type { CatalogueStore } from '#lib/server/store/types.js';

declare global {
  /** The catalogue's version, from package.json at build time. */
  const __CATALOGUE_VERSION__: string;

  namespace App {
    interface Locals {
      /** Identifies the request in the logs and in error responses. */
      requestId: string;
      store: CatalogueStore;
      log: Logger;
      /** A client for a request that fetches, such as a recheck of packages' own manifests, with a budget of its own. */
      http: () => HttpClient;
    }
  }
}

export {};
