// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { es } from '@/shared/i18n';

// Las ofertas y el buscador tienen sus propias pruebas; aquí solo importa dónde va cada pieza en la página.
vi.mock('@/features/offers', () => ({ Offers: () => <section aria-labelledby="ofertas-title"><h2 id="ofertas-title">{es.offers.title}</h2></section> }));

vi.mock('@/features/search', () => ({ SearchForm: () => <form aria-label="Buscador de vuelos" /> }));

import { HomePage } from './HomePage';

afterEach(cleanup);

const renderHome = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );

describe('inicio', () => {
  it('un solo h1 y la jerarquía pedida: buscador → Ofertas → Destinos → Cómo funciona → Preguntas frecuentes', () => {
    renderHome();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual([es.search.title, es.offers.title, es.home.worldsTitle, es.home.stepsTitle, es.help.homeFaqTitle]);
  });

  it('cada ciudad de «Destinos de Ecuador» deja el destino puesto en el buscador', () => {
    renderHome();
    const link = screen.getByRole('link', { name: 'Volar a Cuenca' });
    expect(link.getAttribute('href')).toBe('/?destino=CUE#buscador');
  });

  it('«Cómo funciona» son tres pasos: busca, elige asientos, viaja y gestiona en Mis viajes', () => {
    renderHome();
    const steps = within(screen.getByRole('region', { name: es.home.stepsTitle })).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0].textContent).toContain('Busca');
    expect(steps[1].textContent).toContain('asientos');
    expect(steps[2].textContent).toContain('Mis viajes');
  });

  it('la ayuda breve trae equipaje, cambio de fecha, cancelación, check-in y tiempo para pagar, y se abre con el teclado', () => {
    renderHome();
    const faq = screen.getByRole('region', { name: es.help.homeFaqTitle });
    const questions = within(faq).getAllByText(/\?$/).map((q) => q.textContent);
    expect(questions).toEqual(es.help.faqs.filter((f) => es.help.homeFaqIds.includes(f.id as never)).map((f) => f.q));
    expect(questions).toHaveLength(5);
    const details = within(faq).getByText('¿Cuándo puedo hacer el check-in?').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(within(details).getByText(/48 horas antes de la salida y se cierra 60 minutos antes/)).toBeTruthy();
    expect(within(faq).getByRole('link', { name: es.help.homeFaqAll }).getAttribute('href')).toBe('/ayuda#preguntas');
  });

  it('no queda «Ecuador en cifras» ni «Escápate»: nada decorativo que parezca un dato de la API', () => {
    const { container } = renderHome();
    expect(container.textContent).not.toMatch(/Ecuador en cifras|Escápate|descuento|últimos asientos/i);
  });
});

describe('textos de ayuda: solo reglas documentadas', () => {
  const text = (id: string) => es.help.faqs.find((f) => f.id === id)?.a ?? '';

  it('el check-in abre 48 h antes y cierra 60 min antes; el hold dura 15 minutos', () => {
    expect(text('checkin')).toMatch(/48 horas/);
    expect(text('checkin')).toMatch(/60 minutos/);
    expect(text('hold')).toMatch(/15 minutos/);
  });

  it('el asiento se asigna al reservar (el backend no lo asigna en el check-in)', () => {
    expect(text('seat')).toMatch(/al confirmar tu reserva/);
    expect(text('seat')).not.toMatch(/check-in/);
  });

  it('no promete lo que la API no tiene: nada de cancelación gratis en 24 horas ni tasas en el aeropuerto', () => {
    expect(es.help.termsText).not.toMatch(/24 horas|7 días|tasa de ingreso/i);
  });
});
