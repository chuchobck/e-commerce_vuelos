import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { useFieldControl } from './field';

/** Estilo compartido por todos los controles de texto: 48 px de alto, borde de 2 px con contraste ≥ 3:1. */
export const controlClasses = cn(
  'h-12 w-full rounded border-2 border-input bg-surface px-4 text-base text-foreground',
  'placeholder:text-muted',
  'transition-colors duration-150 motion-reduce:transition-none',
  'hover:border-foreground',
  'disabled:cursor-not-allowed disabled:border-border disabled:bg-background disabled:text-muted',
  'aria-[invalid=true]:border-error aria-[invalid=true]:bg-error-tint/40',
);

/** Variante sin borde para segmentos compactos (el contenedor dibuja el borde y el foco). */
export const bareControlClasses = cn(
  'h-16 w-full min-w-0 rounded border-0 bg-transparent pb-2 pl-4 pr-4 pt-6 text-sm font-bold text-foreground',
  'placeholder:font-normal placeholder:text-muted focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:text-muted',
);

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  variant?: 'default' | 'bare';
  /** Texto o icono fijo antes del valor (p. ej. "+593"). Se anuncia como parte de la etiqueta visual. */
  prefix?: ReactNode;
  /** Elemento al final del campo (p. ej. botón de calendario o de mostrar contraseña). */
  endAdornment?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, prefix, endAdornment, type = 'text', variant = 'default', ...props }, ref) => {
    const field = useFieldControl();
    const input = (
      <input
        ref={ref}
        type={type}
        {...field}
        {...props}
        className={cn(
          variant === 'bare' ? bareControlClasses : controlClasses,
          prefix ? 'rounded-l-none' : null,
          endAdornment ? (variant === 'bare' ? 'pr-12' : 'pr-14') : null,
          className,
        )}
      />
    );

    if (!prefix && !endAdornment) return input;

    return (
      <div className="relative flex w-full">
        {prefix ? (
          <span
            aria-hidden="true"
            className="flex h-12 items-center rounded-l border-2 border-r-0 border-input bg-background px-4 font-bold text-muted"
          >
            {prefix}
          </span>
        ) : null}
        {input}
        {endAdornment ? <div className="absolute inset-y-0 right-0 flex items-center">{endAdornment}</div> : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
