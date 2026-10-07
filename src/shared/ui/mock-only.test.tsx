import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Recarga la configuración con otra VITE_API_URL (se lee al cargar el módulo, como en una compilación). */
async function mockOnlyWith(apiUrl: string) {
  vi.stubEnv('VITE_API_URL', apiUrl);
  vi.resetModules();
  const { MockOnly } = await import('./mock-only');
  return renderToStaticMarkup(
    <MockOnly>
      <p>Para probar: vuelo QD100</p>
    </MockOnly>,
  );
}

describe('pistas "Para probar"', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('se ven con el mock (URL de la API vacía)', async () => {
    expect(await mockOnlyWith('')).toContain('Para probar');
  });

  it('desaparecen con la API real', async () => {
    expect(await mockOnlyWith('https://quinde-vuelos-api.onrender.com/flights/v1')).toBe('');
  });

  it('una URL con solo espacios cuenta como vacía', async () => {
    expect(await mockOnlyWith('   ')).toContain('Para probar');
  });
});
