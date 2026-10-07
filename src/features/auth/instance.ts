import { flightsApi, setAccessTokenProvider } from '@/shared/api';
import { createBrowserChannel, createBrowserLock } from './crossTab';
import { SessionManager } from './session';
import { createTokenStore, type StorageLike } from './tokenStore';

function storage(get: () => Storage): StorageLike | null {
  try {
    return get();
  } catch {
    return null; // almacenamiento bloqueado: la sesión dura lo que la pestaña en memoria
  }
}

/** La sesión de la app: una por pestaña. El cliente HTTP toma de aquí el token de acceso. */
export const session = new SessionManager({
  api: flightsApi,
  store: createTokenStore(
    storage(() => window.sessionStorage),
    storage(() => window.localStorage),
  ),
  lock: createBrowserLock(),
  channel: createBrowserChannel(),
});

setAccessTokenProvider(session.getAccessToken);
