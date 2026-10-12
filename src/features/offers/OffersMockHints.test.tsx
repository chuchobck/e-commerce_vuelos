// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_SCENARIOS } from '@/shared/api';
import { es } from '@/shared/i18n';
import { OffersMockHints } from './OffersMockHints';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const renderHints = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <OffersMockHints />
    </MemoryRouter>,
  );

describe('pistas del mock para las ofertas', () => {
  it('con el mock ofrece «Normal» y un enlace por escenario, con texto en español', () => {
    renderHints();
    const links = within(screen.getByRole('complementary', { name: es.offers.mockTitle })).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual([es.offers.scenarioNormal, ...MOCK_SCENARIOS.map((s) => es.offers.scenarios[s])]);
    expect(links[0].getAttribute('href')).toBe('/');
    expect(links[2].getAttribute('href')).toBe('/?escenario=ruta-sin-vuelos');
  });

  it('en /ofertas los enlaces vuelven a /ofertas', () => {
    renderHints('/ofertas');
    expect(screen.getByRole('link', { name: es.offers.scenarios['limite-429'] }).getAttribute('href')).toBe('/ofertas?escenario=limite-429');
  });

  it('marca el escenario activo (aria-current) y no marca los demás', () => {
    vi.stubGlobal('location', { search: '?escenario=lento' });
    renderHints();
    expect(screen.getByRole('link', { name: es.offers.scenarios.lento }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('link', { name: es.offers.scenarioNormal }).getAttribute('aria-current')).toBeNull();
  });

  it('con la API real no se ve nada (las pistas son solo del mock)', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3010/flights/v1');
    vi.resetModules();
    const { OffersMockHints: Hints } = await import('./OffersMockHints');
    const { container } = render(
      <MemoryRouter>
        <Hints />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });
});
