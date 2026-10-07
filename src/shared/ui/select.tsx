import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';
import { useFieldControl } from './field';
import { bareControlClasses, controlClasses } from './input';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  /** Primera opción vacía, p. ej. "Elige una ciudad". */
  placeholder?: string;
  variant?: 'default' | 'bare';
}

/**
 * Lista desplegable nativa con estilo del sistema. Se usa <select> nativo a propósito:
 * funciona con teclado, lectores de pantalla y selectores táctiles del sistema operativo.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, variant = 'default', ...props }, ref) => {
    const field = useFieldControl();
    return (
      <div className="relative">
        <select
          ref={ref}
          {...field}
          {...props}
          className={cn(
            variant === 'bare' ? bareControlClasses : controlClasses,
            'cursor-pointer appearance-none',
            variant === 'bare' ? 'pr-4' : 'pr-12',
            className,
          )}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        {/* En la variante compacta se omite la flecha para ganar espacio; el segmento ya indica que es elegible. */}
        {variant === 'bare' ? null : (
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-muted"
          />
        )}
      </div>
    );
  },
);
Select.displayName = 'Select';
