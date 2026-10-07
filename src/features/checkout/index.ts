/**
 * Compra en 3 pasos (README, sección 5): selección del paso 1, hold, cuenta, pasajeros y pago.
 * La lógica es una máquina de estados pura (machine.ts) que ejecuta flow.ts; las páginas la usan
 * con `checkout` (acciones) y `useCheckout()` (estado). Solo lo que se exporte aquí es público.
 */
export { AccountBlock } from './AccountBlock';
export { CheckoutSteps } from './CheckoutSteps';
export { CheckoutSummary } from './CheckoutSummary';
export { HoldPanel } from './HoldPanel';
export { PassengersForm } from './PassengersForm';
export { PaymentForm } from './PaymentForm';
export {
  clearSelection,
  loadSelection,
  saveSelection,
  selectionTotal,
  type CheckoutSelection,
  type SelectedLeg,
} from './selection';
export { checkout } from './instance';
export { useCheckout } from './useCheckout';
export { useReleaseOnExit } from './useReleaseOnExit';
export { holdOf, type CheckoutState, type HoldEnd, type PaymentProblem } from './machine';
export { purchaseNotice } from './messages';
export { isDraftComplete } from './passengers';
