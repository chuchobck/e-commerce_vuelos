import { Minus, Plus } from 'lucide-react';
import { forwardRef, useId, type ChangeEvent, type ReactNode } from 'react';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { onlyDigits } from '@/shared/lib/validators';
import { Input, type InputProps } from './input';

export interface NumericInputProps extends Omit<InputProps, 'onChange' | 'value' | 'type'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Máximo de dígitos aceptados. */
  maxDigits?: number;
}

/**
 * Campo solo numérico (cédula, celular, tarjeta). Muestra el teclado numérico en móviles y,
 * al pegar texto con espacios o guiones, conserva los dígitos en lugar de rechazar todo.
 */
export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onValueChange, maxDigits, ...props }, ref) => {
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      const digits = onlyDigits(event.target.value);
      onValueChange(maxDigits ? digits.slice(0, maxDigits) : digits);
    };
    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        {...props}
        value={value}
        onChange={handleChange}
      />
    );
  },
);
NumericInput.displayName = 'NumericInput';

interface QuantityInputProps {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  /** Si es false, el botón + se deshabilita aunque no se haya llegado a `max` (p. ej. tope total de pasajeros). */
  canIncrease?: boolean;
  /** id del grupo (enfocable con tabIndex -1) para llevar el foco allí desde fuera. */
  id?: string;
  className?: string;
}

/**
 * Selector de cantidad con botones − y + de 48 px. El valor actual se anuncia con aria-live
 * para que quien usa lector de pantalla escuche el cambio sin mover el foco.
 */
export function QuantityInput({
  label,
  hint,
  value,
  min = 0,
  max = 9,
  onChange,
  canIncrease = true,
  id: groupId,
  className,
}: QuantityInputProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const decDisabled = value <= min;
  const incDisabled = value >= max || !canIncrease;

  return (
    <div
      id={groupId}
      tabIndex={groupId ? -1 : undefined}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
      className={cn('flex items-center justify-between gap-4', className)}
    >
      <div className="flex flex-col">
        <span id={labelId} className="font-bold">
          {label}
        </span>
        {hint ? (
          <span id={hintId} className="text-sm text-muted">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <QtyButton
          label={fmt(es.common.decrease, { label })}
          disabled={decDisabled}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus aria-hidden="true" className="size-6" />
        </QtyButton>
        <output aria-live="polite" aria-atomic="true" className="min-w-12 text-center text-lg font-bold tabular-nums">
          <span className="sr-only">{label}: </span>
          {value}
        </output>
        <QtyButton
          label={fmt(es.common.increase, { label })}
          disabled={incDisabled}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <Plus aria-hidden="true" className="size-6" />
        </QtyButton>
      </div>
    </div>
  );
}

function QtyButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  // aria-disabled en lugar de disabled: el botón sigue siendo enfocable y se anuncia como no disponible.
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={cn(
        'inline-flex size-12 items-center justify-center rounded-full border-2 border-primary bg-surface text-primary',
        'transition-colors duration-150 hover:bg-primary-tint motion-reduce:transition-none',
        'aria-disabled:cursor-not-allowed aria-disabled:border-border aria-disabled:text-muted aria-disabled:hover:bg-surface',
      )}
    >
      {children}
    </button>
  );
}
