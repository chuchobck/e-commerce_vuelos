import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHECKOUT_BASE, paths } from './routes';

const root = path.resolve(__dirname, '../..');
const rawHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
/** Sin comentarios: algunos explican justamente lo que se prohíbe (p. ej. «sin maximum-scale»). */
const html = rawHtml.replace(/<!--[\s\S]*?-->/g, '');
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');

describe('index.html: lo que se ve antes de que cargue la app', () => {
  it('idioma, descripción, theme-color, favicon y Open Graph básico', () => {
    expect(html).toMatch(/<html lang="es">/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toMatch(/<meta\s+name="description"/);
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9A-Fa-f]{6}" media="\(prefers-color-scheme: light\)"/);
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9A-Fa-f]{6}" media="\(prefers-color-scheme: dark\)"/);
    expect(html).toMatch(/<link rel="icon"/);
    for (const property of ['og:type', 'og:site_name', 'og:locale', 'og:title', 'og:description']) {
      expect(html, property).toContain(`property="${property}"`);
    }
  });

  it('robots.txt existe y cierra las páginas privadas (compra, Mis viajes, perfil) con las rutas reales de la tabla', () => {
    const robots = fs.readFileSync(path.join(root, 'public/robots.txt'), 'utf8');
    expect(robots).toMatch(/^User-agent: \*$/m);
    for (const prefix of [CHECKOUT_BASE, paths.trips, paths.profile]) expect(robots, prefix).toContain(`Disallow: ${prefix}`);
    // Lo público no se bloquea.
    for (const open of [paths.offers, paths.help, paths.results]) expect(robots).not.toContain(`Disallow: ${open}`);
  });

  it('el viewport permite el zoom', () => {
    expect(html).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/);
  });

  it('no usa servidores externos (la CSP estricta de F8 solo permitirá el propio origen)', () => {
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
    expect(css).not.toMatch(/url\(\s*['"]?https?:/);
    expect(css).not.toMatch(/@import\s+url/);
  });

  it('las tipografías son archivos locales que existen, y las precargadas coinciden con las declaradas', () => {
    const declared = [...css.matchAll(/url\('(\/fonts\/[^']+)'\)/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThanOrEqual(2);
    for (const file of declared) expect(fs.existsSync(path.join(root, 'public', file)), file).toBe(true);
    const preloaded = [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map((m) => m[1]);
    expect(preloaded.length).toBeGreaterThan(0);
    for (const file of preloaded) expect(declared, file).toContain(file);
    // Una fuente precargada necesita `crossorigin` aunque sea del mismo origen, o el navegador la descarga dos veces.
    expect(html.match(/<link rel="preload"[^>]*as="font"[^>]*>/g)?.every((tag) => tag.includes('crossorigin'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'public/fonts/LICENSE.txt'))).toBe(true);
  });
});
