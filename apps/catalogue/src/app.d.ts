import type { Accounts } from '@mondarth/accounts-contract';
import type { HttpClient } from '@mondarth/fvtt-resolver/sources';
import type { ApiCaller } from '#lib/server/http/handle.js';
import type { Logger } from '#lib/server/log.js';
import type { SafeFetched } from '#lib/server/safe-fetch.js';
import type { CatalogueStore } from '#lib/server/store/types.js';

declare global {
  /** The catalogue's version, from package.json at build time. */
  const __CATALOGUE_VERSION__: string;

  namespace App {
    interface Locals {
      /** Identifies the request in the logs and in error responses. */
      requestId: string;
      /** Who is asking the API, by their key or their user's token, on the API's requests. */
      caller?: ApiCaller;
      store: CatalogueStore;
      log: Logger;
      /** A client for a request that fetches, such as a recheck of packages' own manifests, with a budget of its own. */
      http: () => HttpClient;
      /** Fetches a URL a client gave, refusing what only the server may reach (see `safe-fetch.ts`). */
      fetchGiven: (url: string) => Promise<SafeFetched>;
      /** The accounts, over their internal API: who a token, or the website's cookie, is for. */
      accounts?: Accounts;
      /** The accounts' address as visitors reach it: where they sign in, and the pages that moved there. */
      accountsSite?: string;
    }
  }
}

export {};
