import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { useId, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { FieldError } from './field';

export interface RadioOption {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}

interface RadioGroupProps {
  legend: ReactNode;
  options: RadioOption[];
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  name?: string;
  /** "cards": opciones como tarjetas grandes; "list": filas compactas. */
  appearance?: 'cards' | 'list';
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  id?: string;
}

/**
 * Grupo de opciones con <fieldset>/<legend> semánticos. Las flechas mueven la selección (Radix).
 * Cada opción ocupa al menos 48 px y toda la tarjeta es clicable.
 */
export function RadioGroup({
  legend,
  options,
  value,
  onValueChange,
  error,
  name,
  appearance = 'cards',
  orientation = 'horizontal',
  className,
  id,
}: RadioGroupProps) {
  const auto = useId();
  const baseId = id ?? `rg${auto.replace(/:/g, '')}`;
  const errorId = `${baseId}-error`;

  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-2', className)}>
      <legend className="mb-2 text-base font-bold">{legend}</legend>
      <RadioGroupPrimitive.Root
        id={baseId}
        name={name}
        value={value}
        onValueChange={onValueChange}
        orientation={orientation}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          'grid gap-2',
          orientation === 'horizontal' && appearance === 'cards' ? 'sm:grid-flow-col sm:auto-cols-fr' : null,
        )}
      >
        {options.map((option) => {
          const itemId = `${baseId}-${option.value}`;
          const hintId = `${itemId}-hint`;
          return (
            <label
              key={option.value}
              htmlFor={itemId}
              className={cn(
                'flex min-h-12 cursor-pointer items-start gap-4 rounded',
                appearance === 'cards'
                  ? 'border-2 border-input bg-surface p-4 hover:border-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-tint'
                  : 'py-2',
                option.disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <RadioGroupPrimitive.Item
                id={itemId}
                value={option.value}
                disabled={option.disabled}
                aria-describedby={option.hint ? hintId : undefined}
                className={cn(
                  'mt-0 inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-input bg-surface',
                  'data-[state=checked]:border-primary',
                )}
              >
                <RadioGroupPrimitive.Indicator className="size-4 rounded-full bg-primary" />
              </RadioGroupPrimitive.Item>
              <span className="flex flex-col">
                <span className="font-bold leading-6">{option.label}</span>
                {option.hint ? (
                  <span id={hintId} className="text-sm text-muted">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </RadioGroupPrimitive.Root>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
