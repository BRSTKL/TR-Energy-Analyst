// window.SUBS → out/subs.json (altyazı zamanları build() içinde hesaplanır)
import fs from 'fs';
const LIB = process.env.LIB, dir = process.argv[2];
const { openDemo, closeServer } = await import(LIB + '/core/render/page.mjs');
const { browser, page } = await openDemo(dir);
fs.writeFileSync(dir + '/out/subs.json', JSON.stringify(await page.evaluate(() => window.SUBS)));
await browser.close(); closeServer();
