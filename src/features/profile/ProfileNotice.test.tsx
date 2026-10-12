// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { es } from '@/shared/i18n';
import { perfilViajero, type TravelerValues } from '@/shared/profile';
import { ProfileNotice } from './ProfileNotice';

const p = es.profile;
const ANA: TravelerValues = { firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', gender: 'F', birthDate: '15/03/1990', documentExpiryDate: '', email: 'ana@example.test', phone: '991234567' };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

const renderNotice = (props: Parameters<typeof ProfileNotice>[0]) =>
  render(
    <MemoryRouter>
      <ProfileNotice {...props} />
    </MemoryRouter>,
  );

describe('aviso «Completa tu perfil para comprar más rápido»', () => {
  it('lo ve quien tiene sesión y no tiene perfil, con un enlace a Mi perfil', () => {
    renderNotice({ userId: 'u1' });
    expect(screen.getByRole('complementary', { name: p.noticeLabel })).toBeTruthy();
    expect(screen.getByText(p.noticeText)).toBeTruthy();
    expect(screen.getByRole('link', { name: p.noticeCta }).getAttribute('href')).toBe('/perfil');
  });

  it('también lo ve quien tiene un perfil incompleto', () => {
    perfilViajero.save('u1', { ...ANA, phone: '' });
    renderNotice({ userId: 'u1' });
    expect(screen.getByText(p.noticeText)).toBeTruthy();
  });

  it('no lo ve quien ya tiene su perfil completo, ni sin sesión, ni donde se pidió ocultarlo', () => {
    perfilViajero.save('u1', ANA);
    expect(renderNotice({ userId: 'u1' }).container.textContent).toBe('');
    cleanup();
    expect(renderNotice({ userId: undefined }).container.textContent).toBe('');
    cleanup();
    expect(renderNotice({ userId: 'u9', hidden: true }).container.textContent).toBe('');
  });

  it('el perfil completo de otro usuario no lo oculta', () => {
    perfilViajero.save('u1', ANA);
    renderNotice({ userId: 'u2' });
    expect(screen.getByText(p.noticeText)).toBeTruthy();
  });

  it('«Ahora no» lo descarta y no vuelve en esta sesión del navegador (ni nada se guarda en el perfil)', () => {
    renderNotice({ userId: 'u1' });
    fireEvent.click(screen.getByRole('button', { name: p.noticeDismiss }));
    expect(screen.queryByText(p.noticeText)).toBeNull();
    cleanup();
    expect(renderNotice({ userId: 'u1' }).container.textContent).toBe('');
    expect(perfilViajero.read('u1')).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('descartarlo es por usuario', () => {
    renderNotice({ userId: 'u1' });
    fireEvent.click(screen.getByRole('button', { name: p.noticeDismiss }));
    cleanup();
    renderNotice({ userId: 'u2' });
    expect(screen.getByText(p.noticeText)).toBeTruthy();
  });

  it('desaparece solo cuando el perfil se completa', () => {
    renderNotice({ userId: 'u1' });
    expect(screen.getByText(p.noticeText)).toBeTruthy();
    act(() => void perfilViajero.save('u1', ANA));
    expect(screen.queryByText(p.noticeText)).toBeNull();
  });
});
