import { useSyncExternalStore } from 'react';
import { serverActivity } from './activity';

/** `true` mientras alguna petición lleve más de 3 s esperando (servidor despertando). */
export function useServerWaking(): boolean {
  return useSyncExternalStore(serverActivity.subscribe, serverActivity.isWaking, () => false);
}
