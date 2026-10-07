/**
 * Coordinación entre pestañas: un candado para que dos pestañas jamás renueven con el mismo
 * refresh token a la vez (Web Locks API) y un canal para avisar del resultado (BroadcastChannel).
 */
import type { AuthTokens } from '@/shared/api';

export interface LockLike {
  /** Ejecuta `task` con el candado `name` tomado; las demás llamadas esperan su turno. */
  request<T>(name: string, task: () => Promise<T>): Promise<T>;
}

export type SessionMessage =
  /** Otra pestaña rotó el refresh token: quien tenga la copia vieja la reemplaza. */
  | { type: 'rotated'; from: string; userId: string | null; previous: string; tokens: AuthTokens }
  /** Otra pestaña cerró la sesión (o se cerró por seguridad). */
  | { type: 'logout'; from: string; userId: string };

export interface ChannelLike {
  post(message: SessionMessage): void;
  listen(handler: (message: SessionMessage) => void): () => void;
}

/**
 * Alternativa si el navegador no tiene Web Locks: cola dentro de la pestaña. Entre pestañas
 * protege la relectura del almacén y las huellas de tokens rotados (ver session.ts).
 */
export function createLocalLock(): LockLike {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request<T>(_name: string, task: () => Promise<T>): Promise<T> {
      const run = tail.then(task, task);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

export function createBrowserLock(): LockLike {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks?.request) return createLocalLock();
  return { request: <T,>(name: string, task: () => Promise<T>) => locks.request(name, task) as Promise<T> };
}

export function createBrowserChannel(name = 'quinde-auth'): ChannelLike {
  if (typeof BroadcastChannel === 'undefined') return { post: () => undefined, listen: () => () => undefined };
  const channel = new BroadcastChannel(name);
  return {
    post: (message) => channel.postMessage(message),
    listen(handler) {
      const onMessage = (event: MessageEvent<SessionMessage>) => handler(event.data);
      channel.addEventListener('message', onMessage);
      return () => channel.removeEventListener('message', onMessage);
    },
  };
}
