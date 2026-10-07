import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { forwardRef, useId, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { FieldError } from './field';

interface CheckboxProps extends ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
}

/**
 * Casilla de 24 px dentro de una fila de 48 px: toda la etiqueta es clicable,
 * así el objetivo táctil supera los 24 × 24 px de WCAG 2.5.8.
 */
export const Checkbox = forwardRef<ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ label, hint, error, className, id, ...props }, ref) => {
    const auto = useId();
    const controlId = id ?? `cb${auto.replace(/:/g, '')}`;
    const hintId = `${controlId}-hint`;
    const errorId = `${controlId}-error`;
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <div className="flex min-h-12 items-start gap-4">
          <CheckboxPrimitive.Root
            ref={ref}
            id={controlId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={cn(
              'mt-2 inline-flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-input bg-surface',
              'hover:border-foreground data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
              'disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-error',
            )}
            {...props}
          >
            <CheckboxPrimitive.Indicator>
              <Check aria-hidden="true" strokeWidth={3} className="size-4" />
            </CheckboxPrimitive.Indicator>
          </CheckboxPrimitive.Root>
          <div className="flex flex-col py-2">
            <label htmlFor={controlId} className="cursor-pointer font-bold">
              {label}
            </label>
            {hint ? (
              <span id={hintId} className="text-sm text-muted">
                {hint}
              </span>
            ) : null}
          </div>
        </div>
        <FieldError id={errorId} message={error} />
      </div>
    );
  },
);
Checkbox.displayName = 'Checkbox';
