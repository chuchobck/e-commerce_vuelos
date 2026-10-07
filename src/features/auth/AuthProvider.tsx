import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { Credentials, User } from '@/shared/api';
import type { SessionManager, SessionState } from './session';

const AuthContext = createContext<SessionManager | null>(null);

/** Adaptador de React del módulo de sesión: restaura al montar y expone el estado. */
export function AuthProvider({ manager, children }: { manager: SessionManager; children: ReactNode }) {
  useEffect(() => {
    void manager.restore();
  }, [manager]);
  return <AuthContext.Provider value={manager}>{children}</AuthContext.Provider>;
}

export interface AuthContextValue extends SessionState {
  login: (credentials: Credentials, persistent: boolean) => Promise<User>;
  register: (credentials: Credentials, persistent: boolean) => Promise<User>;
  logout: () => Promise<void>;
  /** Ejecuta una petición con sesión (renovación y reintento único ante 401). */
  authorized: <T>(call: () => Promise<T>) => Promise<T>;
  /** Vuelve a intentar restaurar la sesión tras un problema de conexión (estado `unavailable`). */
  retryRestore: () => Promise<void>;
}

export function useAuth(): AuthContextValue {
  const manager = useContext(AuthContext);
  if (!manager) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  const state = useSyncExternalStore(manager.subscribe, manager.getState, manager.getState);
  return {
    ...state,
    login: (credentials, persistent) => manager.login(credentials, persistent),
    register: (credentials, persistent) => manager.register(credentials, persistent),
    logout: () => manager.logout(),
    authorized: (call) => manager.authorized(call),
    retryRestore: () => manager.retryRestore(),
  };
}
