// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { es, fmt } from '@/shared/i18n';
import { OfferCard } from './OfferCard';
import { offer } from './testSupport';

afterEach(cleanup);

const renderCard = (props: Parameters<typeof offer>[0] = {}, href = '/resultados?x=1') =>
  render(
    <MemoryRouter>
      <OfferCard offer={offer(props)} href={href} />
    </MemoryRouter>,
  );

describe('tarjeta de oferta', () => {
  it('muestra ruta con nombres de ciudad, fecha, aerolínea y vuelo, horario y «Desde $X» (todo de la oferta)', () => {
    renderCard();
    expect(screen.getByRole('heading', { level: 3, name: 'De Quito a Guayaquil' })).toBeTruthy();
    expect(screen.getByText('13 de oct')).toBeTruthy();
    expect(screen.getByText('LATAM · LA1400')).toBeTruthy();
    expect(screen.getByText('Sale 06:00 · llega 06:55')).toBeTruthy();
    expect(screen.getByText('Directo · 55 min')).toBeTruthy();
    expect(screen.getByText('Desde $55,00')).toBeTruthy();
    expect(screen.getByText(es.offers.priceNote)).toBeTruthy();
  });

  it('no inventa nada: sin porcentajes, sin precio tachado, sin escasez ni contadores', () => {
    const { container } = renderCard();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/%|descuento|antes|últimos|viendo|agot|ahorra/i);
    expect(container.querySelector('del, s, strike')).toBeNull();
  });

  it('con escala dice cuántas y junta los números de vuelo', () => {
    renderCard({ stops: 1, flightNumbers: ['AV1500', 'AV1501'], durationMinutes: 125 });
    expect(screen.getByText('AV1500 + AV1501', { exact: false })).toBeTruthy();
    expect(screen.getByText('1 escala · 2 h 05 min')).toBeTruthy();
  });

  it('«Quedan N asientos» solo aparece si la API informa pocos (9 o menos); con muchos no se menciona', () => {
    renderCard({ seatsLeft: 4 });
    expect(screen.getByText('Quedan 4 asientos en esta tarifa')).toBeTruthy();
    cleanup();
    renderCard({ seatsLeft: 1 });
    expect(screen.getByText('Queda 1 asiento en esta tarifa')).toBeTruthy();
    cleanup();
    renderCard({ seatsLeft: 24 });
    expect(screen.queryByText(/Quedan|Queda/)).toBeNull();
  });

  it('toma la moneda de la oferta', () => {
    renderCard({ price: { cents: 5000, currency: 'EUR' } });
    expect(screen.getByText(/EUR 50,00/)).toBeTruthy();
  });

  it('el único elemento enfocable es «Ver vuelo»: un enlace con nombre único que lleva a los resultados', () => {
    renderCard({}, '/resultados?origen=UIO');
    const link = screen.getByRole('link', { name: fmt(es.offers.ctaLabel, { origin: 'Quito', destination: 'Guayaquil', date: '13 de oct', price: '$55,00' }) });
    expect(link.getAttribute('href')).toBe('/resultados?origen=UIO');
    expect(link.textContent).toBe(es.offers.cta);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('la región del destino ayuda a ubicar Galápagos', () => {
    renderCard({ destination: 'GPS', origin: 'GYE' });
    expect(screen.getByText(es.home.worlds.galapagos.name)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'De Guayaquil a Baltra' })).toBeTruthy();
  });
});
