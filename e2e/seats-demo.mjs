/**
 * Prueba de extremo a extremo del selector de asientos sobre la página de demostración (mock).
 * No es parte de `npm run test` ni agrega dependencias: usa Playwright si está instalado.
 *
 *   npm run dev -- --port 5173 &         # con VITE_API_URL vacía
 *   PLAYWRIGHT_MODULE=/ruta/a/playwright node e2e/seats-demo.mjs [carpeta-de-capturas]
 *
 * Variables: BASE_URL (por defecto http://127.0.0.1:5173), CHROMIUM_PATH (opcional).
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const outDir = process.argv[2] ?? 'e2e-capturas';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
let failures = 0;
const check = (ok, message) => {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${message}`);
  if (!ok) failures++;
};

for (const width of [320, 768, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${base}/componentes/asientos`);
  await page.locator('[role=grid]').waitFor({ timeout: 30_000 });

  // Camino feliz: no hace falta tocar nada.
  check((await page.locator('pre').first().innerText()).trim() === '{}', `${width}px: sin tocar nada el valor es {}`);

  // Elegir con teclado: Tab hasta el mapa, flechas y Enter.
  const seat = page.locator('[role=grid] button[tabindex="0"]');
  await seat.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const value = JSON.parse(await page.locator('pre').first().innerText());
  check(Object.keys(value).length === 1, `${width}px: Enter elige el asiento (${JSON.stringify(value)})`);

  // Sin scroll horizontal de la página; el scroll solo vive dentro del mapa.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `${width}px: sin scroll horizontal en la página (${overflow}px)`);

  // Objetivos de 44 px.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('[role=grid] button')].filter((b) => b.getBoundingClientRect().width < 43.5 || b.getBoundingClientRect().height < 43.5).length,
  );
  check(small === 0, `${width}px: todos los asientos miden al menos 44 px`);

  await page.screenshot({ path: `${outDir}/asientos-${width}-mapa.png`, fullPage: true });

  // La lista es equivalente y se usa sin el mapa.
  await page.getByRole('button', { name: 'Lista' }).click();
  await page.getByRole('table').waitFor();
  const overflowList = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflowList <= 0, `${width}px: la lista no desborda la página`);
  await page.screenshot({ path: `${outDir}/asientos-${width}-lista.png`, fullPage: true });

  check(errors.filter((e) => !/Future Flag/.test(e)).length === 0, `${width}px: sin errores en consola ${JSON.stringify(errors)}`);
  await page.close();
}

await browser.close();
process.exit(failures ? 1 : 0);
