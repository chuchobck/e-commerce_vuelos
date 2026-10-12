// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { es } from '@/shared/i18n';
import { perfilViajero, type TravelerValues } from '@/shared/profile';
import { ProfileForm } from './ProfileForm';

// jsdom no trae ResizeObserver (lo usa el diálogo de Radix para medir).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const p = es.profile;
const ANA: TravelerValues = { firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', gender: 'F', birthDate: '15/03/1990', documentExpiryDate: '', email: 'contacto@example.test', phone: '991234567' };

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: RegExp, value: string) => fireEvent.change(field(label), { target: { value } });
const saveButton = () => screen.getByRole('button', { name: p.save }) as HTMLButtonElement;
const status = () => document.getElementById('perfil-status')?.textContent ?? '';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderForm = (userId = 'u1') => render(<ProfileForm userId={userId} accountEmail="cuenta@example.test" />);

describe('Mi perfil: datos de viajero', () => {
  it('sin perfil guardado: lo explica, el correo de contacto es el de la cuenta y no se puede guardar hasta completarlo', () => {
    renderForm();
    expect(screen.getByText(p.travelerEmpty)).toBeTruthy();
    expect(field(new RegExp(`^${es.travelerForm.contactEmail}`)).value).toBe('cuenta@example.test');
    expect(saveButton().disabled).toBe(true);
    expect(status()).toMatch(/^Falta completar: nombres, apellidos/);
    expect(screen.queryByRole('button', { name: p.forget })).toBeNull();
  });

  it('con un perfil guardado muestra sus datos y ofrece borrarlos', () => {
    perfilViajero.save('u1', ANA);
    renderForm();
    expect(field(/^Nombres/).value).toBe('Ana');
    expect(field(/^Número de documento/).value).toBe('1710034065');
    expect(field(new RegExp(`^${es.travelerForm.contactEmail}`)).value).toBe('contacto@example.test');
    expect(status()).toBe(p.saveReady);
    expect(saveButton().disabled).toBe(false);
    expect(screen.getByRole('button', { name: p.forget })).toBeTruthy();
    expect(screen.queryByText(p.travelerEmpty)).toBeNull();
  });

  it('cada usuario ve solo su perfil', () => {
    perfilViajero.save('u1', ANA);
    renderForm('u2');
    expect(field(/^Nombres/).value).toBe('');
  });

  it('un perfil incompleto se ve igual y se marca lo que falta; al completarlo ya se puede guardar', async () => {
    perfilViajero.save('u1', { ...ANA, phone: '', birthDate: '01/01/2020' });
    renderForm();
    expect(field(/^Nombres/).value).toBe('Ana');
    expect(status()).toMatch(/Falta completar: celular/);
    expect(status()).toMatch(/Revisa: fecha de nacimiento/);
    expect(saveButton().disabled).toBe(true);
    type(/^Celular/, '991234567');
    type(/^Fecha de nacimiento/, '15/03/1990');
    await waitFor(() => expect(saveButton().disabled).toBe(false));
  });

  it('valida al salir del campo, con las reglas del registro', async () => {
    renderForm();
    type(/^Número de documento/, '1710034066');
    fireEvent.blur(field(/^Número de documento/));
    expect(await screen.findByText(es.validation.cedulaInvalid)).toBeTruthy();
    type(/^Nombres/, 'Ana2');
    expect(field(/^Nombres/).value).toBe('Ana');
  });

  it('guardar deja los datos normalizados en este dispositivo y confirma', async () => {
    renderForm();
    type(/^Nombres/, '  Ana   María ');
    type(/^Apellidos/, 'Pérez Loor');
    type(/^Número de documento/, '1710034065');
    fireEvent.change(field(/^Sexo según el documento/), { target: { value: 'F' } });
    type(/^Fecha de nacimiento/, '15/03/1990');
    type(/^Celular/, '991234567');
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(saveButton());
    await waitFor(() => expect(perfilViajero.read('u1')).not.toBeNull());
    expect(perfilViajero.read('u1')).toMatchObject({ firstName: 'Ana María', lastName: 'Pérez Loor', documentNumber: '1710034065', email: 'cuenta@example.test', phone: '991234567' });
    expect(perfilViajero.read('u2')).toBeNull();
  });

  it('si el navegador no deja guardar lo dice junto al formulario y no pierde lo escrito', async () => {
    perfilViajero.save('u1', ANA);
    renderForm();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    type(/^Nombres/, 'Ana María');
    fireEvent.click(saveButton());
    expect(await screen.findByText(p.saveFailed)).toBeTruthy();
    expect(field(/^Nombres/).value).toBe('Ana María');
  });
});

describe('Mi perfil: borrar mis datos guardados', () => {
  it('pide confirmar; «No, conservarlos» no borra nada', async () => {
    perfilViajero.save('u1', ANA);
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: p.forget }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(p.forgetTitle)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: p.forgetKeep }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(perfilViajero.read('u1')).not.toBeNull();
    expect(field(/^Nombres/).value).toBe('Ana');
  });

  it('al confirmar borra el perfil de este usuario (no el de otros) y el formulario queda vacío con el correo de la cuenta', async () => {
    perfilViajero.save('u1', ANA);
    perfilViajero.save('u2', { ...ANA, firstName: 'Luis' });
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: p.forget }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: p.forgetConfirm }));
    await waitFor(() => expect(perfilViajero.read('u1')).toBeNull());
    expect(perfilViajero.read('u2')?.firstName).toBe('Luis');
    await waitFor(() => expect(field(/^Nombres/).value).toBe(''));
    expect(field(new RegExp(`^${es.travelerForm.contactEmail}`)).value).toBe('cuenta@example.test');
    expect(screen.queryByRole('button', { name: p.forget })).toBeNull();
    expect(screen.getByText(p.travelerEmpty)).toBeTruthy();
  });
});
