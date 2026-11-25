/**
 * Renders a Mondarth website's favicons from its logo, in Chromium, so that each is what browsers draw:
 *
 * - `favicon.svg`: the icon (`brand/<site>-icon.svg`: square, its emblem larger, for small sizes);
 * - `favicon.ico`: the icon at 16, 32 and 48 pixels;
 * - `apple-touch-icon.png`: 180 pixels, on the page's colour, as iOS fills transparency with black;
 * - `icon-192.png`, `icon-512.png`: for the web app manifest.
 *
 * `node scripts/icons.ts <site> <directory>`, where `<site>` is mondarth, catalogue, aide or accounts. Run by hand when a
 * logo changes, and commit what it writes; nothing builds it.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

const SITES = ['mondarth', 'catalogue', 'aide', 'accounts'];
/** The light theme's page, `palette.slate.50`. */
const PAGE = '#f2f8f9';

const [site = '', directory = ''] = process.argv.slice(2);
if (!SITES.includes(site) || directory === '') {
  process.stderr.write(`Usage: node scripts/icons.ts <${SITES.join('|')}> <directory>\n`);
  process.exit(1);
}

const iconFile = new URL(`../brand/${site}-icon.svg`, import.meta.url);
const icon = await readFile(iconFile, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();

/**
 * The icon drawn as a PNG.
 *
 * @param size - Its width and height, in pixels
 * @param background - What it is drawn on; transparent unless given
 * @param inset - The share of each side left empty around it
 * @returns The PNG
 */
async function png(size: number, background?: string, inset = 0): Promise<Buffer> {
  await page.setViewportSize({ width: size, height: size });
  const drawn = Math.round(size * (1 - 2 * inset));
  await page.setContent(
    `<body style="margin:0;display:grid;place-items:center;height:100vh;background:${background ?? 'transparent'}">` +
      `<img style="width:${String(drawn)}px;height:${String(drawn)}px" src="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}">`,
  );
  return page.screenshot({ omitBackground: background === undefined });
}

/**
 * An ICO of PNGs, which every browser reads: a header, an entry for each image, then the images.
 *
 * @param images - Each image's size and PNG
 * @returns The ICO
 */
function ico(images: readonly { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

await mkdir(directory, { recursive: true });
await copyFile(iconFile, join(directory, 'favicon.svg'));
// One at a time: they share the page.
const small: { size: number; data: Buffer }[] = [];
for (const size of [16, 32, 48]) small.push({ size, data: await png(size) });
await writeFile(join(directory, 'favicon.ico'), ico(small));
await writeFile(join(directory, 'apple-touch-icon.png'), await png(180, PAGE, 0.08));
await writeFile(join(directory, 'icon-192.png'), await png(192));
await writeFile(join(directory, 'icon-512.png'), await png(512));
await browser.close();
process.stdout.write(`${site}: favicons written to ${directory}\n`);
