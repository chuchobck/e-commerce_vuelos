import { useSyncExternalStore } from 'react';
import { checkout } from './instance';
import type { CheckoutState } from './machine';

/** Estado de la compra de esta pestaña; las acciones se llaman sobre `checkout`. */
export function useCheckout(): CheckoutState {
  return useSyncExternalStore(checkout.subscribe, checkout.getState, checkout.getState);
}
