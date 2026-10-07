// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AuthTokens, type User } from '@/shared/api';
import { es } from '@/shared/i18n';
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

afterEach(cleanup);

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
  const fill = () => {
    fireEvent.change(email(), { target: { value: 'ana@example.test' } });
    fireEvent.change(password(a.newPassword), { target: { value: GOOD_PASSWORD } });
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(a.terms) }));
  };

  it('pide aceptar los términos', async () => {
    setup('register');
    fireEvent.change(email(), { target: { value: 'ana@example.test' } });
    fireEvent.change(password(a.newPassword), { target: { value: GOOD_PASSWORD } });
    submit(a.submitRegister);
    expect(await screen.findByText(es.validation.termsRequired)).toBeTruthy();
  });

  it('409: "correo ya registrado" en el campo de correo, con foco', async () => {
    setup('register', {
      register: async () => {
        throw new ApiError({ status: 409, code: 'VALIDATION_FAILED' });
      },
    });
    fill();
    submit(a.submitRegister);
    expect(await screen.findByText(a.emailTaken)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(email()));
  });

  it('cuenta creada pero el ingreso falló: lo explica sin decir que el registro falló', async () => {
    setup('register', {
      login: async () => {
        throw new ApiError({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 20 });
      },
    });
    fill();
    submit(a.submitRegister);
    expect(await screen.findByText(/Tu cuenta se creó/)).toBeTruthy();
  });

  it('nunca envía un rol: solo correo y contraseña', async () => {
    const { api, onSuccess } = setup('register');
    fill();
    submit(a.submitRegister);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(api.register).toHaveBeenCalledWith({ email: 'ana@example.test', password: GOOD_PASSWORD });
  });
});
