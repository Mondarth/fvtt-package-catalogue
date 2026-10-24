import { E2E_API_KEY } from '../environment.js';
import { expect, test } from '../fixtures.js';

// Only the website is localised: the API answers the same whatever language the client prefers, and has no paths
// under a locale.
test('the API is never localised', async ({ playwright, baseURL }) => {
  const spanish = await playwright.request.newContext({
    baseURL: baseURL ?? '',
    extraHTTPHeaders: { 'Accept-Language': 'es', Cookie: 'PARAGLIDE_LOCALE=es', 'X-API-Key': E2E_API_KEY },
  });
  const response = await spanish.get('/api/v1/packages/module/nobody/releases');
  expect(await response.json()).toMatchObject({ error: { message: 'The catalogue does not know module:nobody' } });
  expect((await spanish.get('/es/api/v1/status')).status()).toBe(404);
  await spanish.dispose();
});
