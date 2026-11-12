// Renders assets/src/*.mmd to assets/*.svg and assets/*.png, and assets/src/*.html to assets/*.png (Chrome screenshot).
//   node assets/render.mjs
// Uses an installed Chrome or Edge (no browser download). Set MMDC to a local mmdc binary to skip npx.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');

const browsers = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const browser = browsers.find((p) => existsSync(p));
if (!browser) throw new Error('No Chrome/Edge found; set CHROME_PATH');

const tmp = mkdtempSync(join(tmpdir(), 'cs-assets-'));
const puppeteerConfig = join(tmp, 'puppeteer.json');
writeFileSync(puppeteerConfig, JSON.stringify({ executablePath: browser, args: ['--no-sandbox'] }));

const mmdc = process.env.MMDC ? [process.env.MMDC] : ['npx', '-y', '@mermaid-js/mermaid-cli@12.2.0'];
const env = { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' };
const shell = process.platform === 'win32';

for (const file of readdirSync(src).filter((f) => f.endsWith('.mmd')).sort()) {
  const name = basename(file, '.mmd');
  for (const [ext, extra] of [
    ['svg', []],
    ['png', ['--size', '2200', '-s', '2', '-b', 'white']],
  ]) {
    const [cmd, ...args] = mmdc;
    execFileSync(
      cmd,
      [...args, '-p', puppeteerConfig, '-c', join(src, 'mermaid.config.json'), '-i', join(src, file), '-o', join(here, `${name}.${ext}`), ...extra],
      { stdio: 'inherit', env, shell },
    );
  }
}

for (const file of readdirSync(src).filter((f) => f.endsWith('.html')).sort()) {
  const name = basename(file, '.html');
  // Each page declares its capture size in a comment: <!-- size: 1400x560 -->
  const size = /<!-- size: (\d+)x(\d+) -->/.exec(readFileSync(join(src, file), 'utf8'));
  const [width, height] = size ? [size[1], size[2]] : ['1400', '1000'];
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      `--window-size=${width},${height}`,
      `--screenshot=${join(here, `${name}.png`)}`,
      pathToFileURL(join(src, file)).href,
    ],
    { stdio: 'inherit' },
  );
}
console.log('Rendered into', here);
