// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AuthTokens, type User } from '@/shared/api';
import { es } from '@/shared/i18n';
import { perfilViajero } from '@/shared/profile';
import { AuthProvider } from './AuthProvider';
import { createLocalLock } from './crossTab';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { SessionManager, type AuthApi } from './session';
import { createTokenStore } from './tokenStore';

const a = es.auth;

// jsdom no trae ResizeObserver (lo usa la casilla de Radix para medir).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
const USER: User = { id: 'u1', email: 'ana@example.test', roles: ['cliente'], scopes: [], createdAt: '2026-10-07T00:00:00Z' };
const TOKENS: AuthTokens = { accessToken: 'a.b.c', refreshToken: 'r'.repeat(43), expiresIn: 900, scope: '' };
const GOOD_PASSWORD = 'una frase larga de prueba';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

function setup(form: 'login' | 'register', api: Partial<AuthApi> = {}) {
  const fullApi: AuthApi = {
    register: vi.fn(async () => USER),
    login: vi.fn(async () => TOKENS),
    refresh: vi.fn(async () => TOKENS),
    logout: vi.fn(async () => undefined),
    me: vi.fn(async () => USER),
    ...api,
  };
  const manager = new SessionManager({
    api: fullApi,
    store: createTokenStore(memoryStorage(), memoryStorage()),
    lock: createLocalLock(),
    channel: { post: () => undefined, listen: () => () => undefined },
    schedule: () => () => undefined,
  });
  const onSuccess = vi.fn();
  render(<AuthProvider manager={manager}>{form === 'login' ? <LoginForm onSuccess={onSuccess} /> : <RegisterForm onSuccess={onSuccess} />}</AuthProvider>);
  return { api: fullApi, onSuccess };
}

const email = () => screen.getByRole('textbox', { name: new RegExp(a.email) }) as HTMLInputElement;
const password = (label: string = a.password) => screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
const submit = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LoginForm', () => {
  it('sin datos: errores por campo con role="alert" y foco en el primero', async () => {
    setup('login');
    submit(a.submitLogin);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((el) => el.textContent)).toEqual([es.validation.required, es.validation.required]);
    await waitFor(() => expect(document.activeElement).toBe(email()));
  });

  it('contraseña corta: el error va a su campo y el foco también', async () => {
    const { api } = setup('login');
    fireEvent.change(email(), { target: { value: 'ana@example.test' } });
    fireEvent.change(password(), { target: { value: 'corta' } });
    submit(a.submitLogin);
    expect(await screen.findByText(es.validation.passwordLength)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(password()));
    expect(api.login).not.toHaveBeenCalled();
  });

  it('mostrar/ocultar contraseña con aria-pressed (y se puede pegar)', () => {
    setup('login');
    const toggle = screen.getByRole('button', { name: es.common.showPassword });
    expect(password().type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(password().type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(fireEvent.paste(password())).toBe(true); // nadie cancela el pegado
  });

  it('no envía dos veces aunque se pulse Enter con la petición en curso', async () => {
    let finish!: (t: AuthTokens) => void;
    const login = vi.fn(() => new Promise<AuthTokens>((r) => (finish = r)));
    const { onSuccess } = setup('login', { login });
    fireEvent.change(email(), { target: { value: 'ana@example.test' } });
    fireEvent.change(password(), { target: { value: GOOD_PASSWORD } });
    submit(a.submitLogin);
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    fireEvent.submit(email().form!);
    submit(a.submittingLogin);
    await act(async () => finish(TOKENS));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(USER));
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('envía el correo normalizado y avisa genéricamente ante un 401', async () => {
    const login = vi.fn(async () => {
      throw new ApiError({ status: 401, code: 'VALIDATION_FAILED' });
    });
    setup('login', { login });
    fireEvent.change(email(), { target: { value: '  Ana@Example.TEST ' } });
    fireEvent.change(password(), { target: { value: GOOD_PASSWORD } });
    submit(a.submitLogin);
    expect(await screen.findByText(a.invalidCredentials)).toBeTruthy();
    expect(login).toHaveBeenCalledWith({ email: 'ana@example.test', password: GOOD_PASSWORD });
  });

  it('429: dice cuánto esperar', async () => {
    setup('login', {
      login: async () => {
        throw new ApiError({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 37 });
      },
    });
    fireEvent.change(email(), { target: { value: 'ana@example.test' } });
    fireEvent.change(password(), { target: { value: GOOD_PASSWORD } });
    submit(a.submitLogin);
    expect(await screen.findByText(/37 segundos/)).toBeTruthy();
  });
});

describe('RegisterForm', () => {
  const t = es.travelerForm;
  const f = es.checkoutForms;
  const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
  const type = (label: RegExp, value: string) => fireEvent.change(field(label), { target: { value } });

  /** La cuenta y las condiciones. */
  const fillAccount = () => {
    fireEvent.change(email(), { target: { value: 'ana@example.test' } });
    fireEvent.change(password(a.newPassword), { target: { value: GOOD_PASSWORD } });
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(a.terms) }));
  };
  /** Los datos de viajero (una adulta ecuatoriana con cédula válida). */
  const fillTraveler = (over: Partial<Record<'first' | 'last' | 'doc' | 'birth' | 'phone', string>> = {}) => {
    type(/^Nombres/, over.first ?? 'Ana María');
    type(/^Apellidos/, over.last ?? 'Pérez Loor');
    type(/^Número de documento/, over.doc ?? '1710034065');
    fireEvent.change(field(/^Sexo según el documento/), { target: { value: 'F' } });
    type(/^Fecha de nacimiento/, over.birth ?? '15/03/1990');
    type(/^Celular/, over.phone ?? '991234567');
  };
  const fill = () => {
    fillAccount();
    fillTraveler();
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('pide aceptar los términos', async () => {
    setup('register');
    fireEvent.change(email(), { target: { value: 'ana@example.test' } });
    fireEvent.change(password(a.newPassword), { target: { value: GOOD_PASSWORD } });
    fillTraveler();
    submit(a.submitRegister);
    expect(await screen.findByText(es.validation.termsRequired)).toBeTruthy();
  });

  it('409: "correo ya registrado" en el campo de correo, con foco; no guarda nada y conserva todo lo escrito', async () => {
    const { onSuccess } = setup('register', {
      register: async () => {
        throw new ApiError({ status: 409, code: 'VALIDATION_FAILED' });
      },
    });
    fill();
    submit(a.submitRegister);
    expect(await screen.findByText(a.emailTaken)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(email()));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    // Nada de lo escrito se perdió.
    expect(field(/^Nombres/).value).toBe('Ana María');
    expect(field(/^Número de documento/).value).toBe('1710034065');
    expect(field(/^Fecha de nacimiento/).value).toBe('15/03/1990');
    expect(field(/^Celular/).value).toBe('991234567');
    expect(password(a.newPassword).value).toBe(GOOD_PASSWORD);
  });

  it('cuenta creada pero el ingreso falló: lo explica sin decir que el registro falló y no guarda el perfil (no hay sesión)', async () => {
    setup('register', {
      login: async () => {
        throw new ApiError({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 20 });
      },
    });
    fill();
    submit(a.submitRegister);
    expect(await screen.findByText(/Tu cuenta se creó/)).toBeTruthy();
    expect(localStorage.length).toBe(0);
    expect(field(/^Nombres/).value).toBe('Ana María');
  });

  it('a /auth/register solo van el correo y la contraseña: nunca un rol ni los datos de viajero', async () => {
    const { api, onSuccess } = setup('register');
    fill();
    submit(a.submitRegister);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(api.register).toHaveBeenCalledTimes(1);
    expect(api.register).toHaveBeenCalledWith({ email: 'ana@example.test', password: GOOD_PASSWORD });
    expect(Object.keys((api.register as ReturnType<typeof vi.fn>).mock.calls[0][0] as object).sort()).toEqual(['email', 'password']);
  });

  it('con la cuenta creada y la sesión iniciada guarda los datos de viajero en este dispositivo, con la clave del usuario y sin contraseña ni tokens', async () => {
    const { onSuccess } = setup('register');
    fill();
    submit(a.submitRegister);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(USER, { profileSaved: true }));
    expect(perfilViajero.read(USER.id)).toEqual({
      firstName: 'Ana María',
      lastName: 'Pérez Loor',
      documentType: 'NATIONAL_ID',
      documentNumber: '1710034065',
      nationality: 'EC',
      gender: 'F',
      birthDate: '15/03/1990',
      documentExpiryDate: '',
      email: 'ana@example.test',
      phone: '991234567',
    });
    expect([...Array(localStorage.length).keys()].map((i) => localStorage.key(i))).toEqual([`quinde.perfil.v1:${USER.id}`]);
    const stored = localStorage.getItem(`quinde.perfil.v1:${USER.id}`) ?? '';
    expect(stored).not.toContain(GOOD_PASSWORD);
    expect(stored).not.toContain(TOKENS.refreshToken);
    expect(stored).not.toContain(TOKENS.accessToken);
  });

  it('si el navegador no deja guardar los datos, la cuenta igual queda creada y se avisa (profileSaved: false)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { api, onSuccess } = setup('register');
    fill();
    submit(a.submitRegister);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(USER, { profileSaved: false }));
    expect(api.register).toHaveBeenCalled();
  });

  it('avisa con una línea clara que los datos se guardan solo en este dispositivo', () => {
    setup('register');
    expect(screen.getByText(t.localNotice)).toBeTruthy();
    expect(t.localNotice).toMatch(/solo en este dispositivo/);
  });

  it('sin datos: ningún envío, un error por campo (no una caja global) y el foco en el primero', async () => {
    const { api } = setup('register');
    submit(a.submitRegister);
    expect(await screen.findAllByText(es.validation.required)).not.toHaveLength(0);
    expect(api.register).not.toHaveBeenCalled();
    expect(screen.queryByText(/Revisa \d+ campo/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(email()));
  });

  describe('validación de los datos de viajero (al salir del campo)', () => {
    it('los nombres no admiten números ni signos: no entran', () => {
      setup('register');
      type(/^Nombres/, 'Ana2 !Mar-ía');
      expect(field(/^Nombres/).value).toBe('Ana María');
    });

    it('cédula inválida: el mensaje sale al salir del campo y se va al corregirla', async () => {
      setup('register');
      type(/^Número de documento/, '1710034066');
      expect(screen.queryByText(es.validation.cedulaInvalid)).toBeNull();
      fireEvent.blur(field(/^Número de documento/));
      expect(await screen.findByText(es.validation.cedulaInvalid)).toBeTruthy();
      type(/^Número de documento/, '1710034065');
      await waitFor(() => expect(screen.queryByText(es.validation.cedulaInvalid)).toBeNull());
    });

    it('la cédula solo admite 10 dígitos; el pasaporte pide su vencimiento', async () => {
      setup('register');
      type(/^Número de documento/, '17-10 034 065xx99');
      expect(field(/^Número de documento/).value).toBe('1710034065');
      expect(screen.queryByLabelText(new RegExp(`^${f.documentExpiry}`))).toBeNull();
      fireEvent.change(screen.getByLabelText(new RegExp(`^${f.documentType}`)), { target: { value: 'PASSPORT' } });
      expect(field(new RegExp(`^${f.documentExpiry}`))).toBeTruthy();
      type(/^Número de documento/, 'ab-123 45');
      expect(field(/^Número de documento/).value).toBe('AB12345');
      fireEvent.blur(field(new RegExp(`^${f.documentExpiry}`)));
      expect(await screen.findByText(es.validation.required)).toBeTruthy();
    });

    it('la fecha no deja escribir un mes 13 ni un día 32, y un menor de 18 años recibe su mensaje', async () => {
      setup('register');
      type(/^Fecha de nacimiento/, '45/13/2000');
      expect(field(/^Fecha de nacimiento/).value).not.toMatch(/13/);
      type(/^Fecha de nacimiento/, '01/01/2020');
      fireEvent.blur(field(/^Fecha de nacimiento/));
      expect(await screen.findByText(t.birthAdult)).toBeTruthy();
    });

    it('el celular solo admite dígitos (9 después de +593)', async () => {
      setup('register');
      type(/^Celular/, '09 91-23 4567abc');
      expect(field(/^Celular/).value).toBe('099123456');
      fireEvent.blur(field(/^Celular/));
      expect(await screen.findByText(es.validation.phoneInvalid)).toBeTruthy();
    });

    it('nacionalidad distinta de Ecuador: se puede registrar y se explica que por ahora no se puede comprar con ella', () => {
      setup('register');
      fireEvent.change(field(new RegExp(`^${f.nationality}`)), { target: { value: 'PE' } });
      expect(screen.getByText(t.nationalityNotBookable)).toBeTruthy();
    });
  });

  it('el correo de contacto es el de la cuenta hasta que se cambia; después ya no lo sigue', async () => {
    setup('register');
    const contact = () => field(new RegExp(`^${t.contactEmail}`));
    fireEvent.change(email(), { target: { value: 'ana@example.test' } });
    await waitFor(() => expect(contact().value).toBe('ana@example.test'));
    fireEvent.change(email(), { target: { value: 'ana.perez@example.test' } });
    await waitFor(() => expect(contact().value).toBe('ana.perez@example.test'));
    fireEvent.change(contact(), { target: { value: 'contacto@example.test' } });
    fireEvent.change(email(), { target: { value: 'otra@example.test' } });
    await new Promise((r) => setTimeout(r, 30));
    expect(contact().value).toBe('contacto@example.test');
  });

  it('junto al botón dice qué falta y qué revisar, y al terminar «Todo listo» (el botón sigue activo para los gestores de contraseñas)', async () => {
    setup('register');
    const status = () => document.getElementById('reg-status')?.textContent ?? '';
    expect(status()).toMatch(/^Falta completar: /);
    expect(status()).toContain('correo electrónico');
    fillAccount();
    fillTraveler({ phone: '99' });
    await waitFor(() => expect(status()).toMatch(/Revisa: celular/));
    fillTraveler();
    await waitFor(() => expect(status()).toBe(es.forms.ready));
    expect((screen.getByRole('button', { name: a.submitRegister }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('cerrar sesión no borra el perfil de viajero', () => {
  it('el perfil sigue ahí después de cerrar sesión (solo se borra a pedido de la persona)', async () => {
    localStorage.clear();
    perfilViajero.save(USER.id, { firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', gender: 'F', birthDate: '15/03/1990', documentExpiryDate: '', email: 'ana@example.test', phone: '991234567' });
    const manager = new SessionManager({
      api: { register: vi.fn(async () => USER), login: vi.fn(async () => TOKENS), refresh: vi.fn(async () => TOKENS), logout: vi.fn(async () => undefined), me: vi.fn(async () => USER) },
      store: createTokenStore(memoryStorage(), memoryStorage()),
      lock: createLocalLock(),
      channel: { post: () => undefined, listen: () => () => undefined },
      schedule: () => () => undefined,
    });
    await manager.login({ email: USER.email, password: GOOD_PASSWORD }, false);
    await manager.logout();
    expect(perfilViajero.read(USER.id)?.firstName).toBe('Ana');
  });
});
