import { es } from '@/shared/i18n';
import { Stepper } from '@/shared/ui';

const p = es.purchase;
const STEPS = [p.steps.flight, p.steps.account, p.steps.payment];

/**
 * Indicador de la compra: siempre 3 pasos (README, sección 5).
 * `current` = 3 marca los tres como completados (pantalla de confirmación, que no es un paso).
 */
export function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  return <Stepper steps={STEPS} current={current} />;
}
