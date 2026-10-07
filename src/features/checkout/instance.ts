import { flightsApi } from '@/shared/api';
import { createAttemptStore, createDraftStore } from './draft';
import { CheckoutFlow } from './flow';
import { createIntentKeys, type StorageLike } from './idempotency';
import { clearSelection, loadSelection, setSelectionHold } from './selection';

function sessionStore(): StorageLike | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

const storage = sessionStore();

/** La compra de esta pestaña (sessionStorage: dos pestañas no se pisan). */
export const checkout = new CheckoutFlow({
  api: flightsApi,
  selection: { load: loadSelection, setHold: setSelectionHold, clear: clearSelection },
  keys: createIntentKeys(storage),
  draft: createDraftStore(storage),
  attempt: createAttemptStore(storage),
});
