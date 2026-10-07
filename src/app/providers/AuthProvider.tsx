import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { flightsApi, type AuthSession, type LoginRequest, type RegisterRequest } from '@/shared/api';

const STORAGE_KEY = 'quinde.session';

interface AuthContextValue {
  session: AuthSession | null;
  login: (request: LoginRequest) => Promise<AuthSession>;
  register: (request: RegisterRequest) => Promise<AuthSession>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    return new Date(session.expiresAt).getTime() > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function writeSession(session: AuthSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sin almacenamiento: la sesión dura lo que dure la pestaña */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readSession);

  const login = useCallback(async (request: LoginRequest) => {
    const s = await flightsApi.login(request);
    writeSession(s);
    setSession(s);
    return s;
  }, []);

  const register = useCallback(async (request: RegisterRequest) => {
    const s = await flightsApi.register(request);
    writeSession(s);
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(() => {
    writeSession(null);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, login, register, logout }), [session, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
