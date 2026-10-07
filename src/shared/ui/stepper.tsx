import { Check } from 'lucide-react';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';

interface StepperProps {
  steps: string[];
  /** Índice (desde 0) del paso actual. */
  current: number;
  label?: string;
  className?: string;
}

/**
 * Indicador de progreso de la compra. Lista ordenada con aria-current="step" en el paso actual
 * y el estado de cada paso escrito en texto (no solo por color o icono).
 */
export function Stepper({ steps, current, label = es.purchase.stepperLabel, className }: StepperProps) {
  return (
    <nav aria-label={label} className={className}>
      <p className="sr-only">{fmt(es.purchase.stepOf, { current: current + 1, total: steps.length })}</p>
      <ol className="flex items-start">
        {steps.map((step, i) => {
          const state = i < current ? 'complete' : i === current ? 'current' : 'upcoming';
          return (
            <li
              key={step}
              aria-current={state === 'current' ? 'step' : undefined}
              className="relative flex flex-1 flex-col items-center gap-2 text-center"
            >
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute right-1/2 top-6 h-px w-full -translate-y-1/2 border-t-4',
                    i <= current ? 'border-primary' : 'border-border',
                  )}
                />
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  'relative z-10 flex size-12 items-center justify-center rounded-full border-2 text-lg font-bold',
                  state === 'complete' && 'border-primary bg-primary text-primary-foreground',
                  state === 'current' && 'border-primary bg-surface text-primary ring-4 ring-primary/30',
                  state === 'upcoming' && 'border-input bg-surface text-muted',
                )}
              >
                {state === 'complete' ? <Check strokeWidth={3} className="size-6" /> : i + 1}
              </span>
              <span className={cn('text-sm', state === 'current' ? 'font-bold text-foreground' : 'text-muted')}>
                {step}
                <span className="sr-only">, {es.purchase.stepState[state]}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
