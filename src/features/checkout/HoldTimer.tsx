import { es } from '@/shared/i18n';
import { Timer, toast } from '@/shared/ui';
import { holdDeadline } from './holdClock';
import { checkout } from './instance';
import { holdOf, type CheckoutState } from './machine';

/**
 * Temporizador del precio apartado, con el tiempo del SERVIDOR. Avisa a los 5 minutos (cortés) y a
 * los 2 (asertivo) y ofrece "Necesito más tiempo" (WCAG 2.2.1) mientras se editan los datos.
 */
export function HoldTimer({ state }: { state: CheckoutState }) {
  const hold = holdOf(state);
  if (!hold || state.step === 'paying') return null;
  return (
    <Timer
      deadline={holdDeadline(hold)}
      onExpire={() => void checkout.timeUp()}
      onExtend={state.step === 'held' ? () => void checkout.extend().then(() => toast({ title: es.purchase.extended, variant: 'success' })) : undefined}
    />
  );
}
