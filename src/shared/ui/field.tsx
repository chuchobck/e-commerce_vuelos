import * as LabelPrimitive from '@radix-ui/react-label';
import { AlertCircle } from 'lucide-react';
import { createContext, useContext, useId, type ReactNode } from 'react';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';

interface FieldContextValue {
  id: string;
  hintId: string;
  errorId: string;
  hasHint: boolean;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Atributos que un control necesita para quedar ligado a su etiqueta, pista y error.
 * Fuera de un <Field> devuelve un objeto vacío para que el control funcione solo.
 */
export function useFieldControl() {
  const ctx = useContext(FieldContext);
  if (!ctx) return {};
  const describedBy = [ctx.invalid ? ctx.errorId : null, ctx.hasHint ? ctx.hintId : null].filter(Boolean).join(' ');
  return {
    id: ctx.id,
    'aria-describedby': describedBy || undefined,
    'aria-invalid': ctx.invalid || undefined,
    'aria-required': ctx.required || undefined,
  } as const;
}

interface FieldProps {
  label: ReactNode;
  /** Instrucción persistente bajo el control (nunca se usa el placeholder como etiqueta). */
  hint?: ReactNode;
  error?: string;
  /** Los campos opcionales se marcan con "(opcional)"; los obligatorios llevan aria-required. */
  required?: boolean;
  /** id del control; si se omite se genera uno. Útil para llevar el foco allí desde fuera. */
  id?: string;
  className?: string;
  labelClassName?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required = false, id, className, labelClassName, children }: FieldProps) {
  const auto = useId();
  const controlId = id ?? `f${auto.replace(/:/g, '')}`;
  const value: FieldContextValue = {
    id: controlId,
    hintId: `${controlId}-hint`,
    errorId: `${controlId}-error`,
    hasHint: !!hint,
    invalid: !!error,
    required,
  };

  // Orden fijo: etiqueta → control → error → ayuda. Con la ayuda debajo del control, los controles de dos campos
  // vecinos quedan a la misma altura aunque una ayuda ocupe más líneas que la otra.
  return (
    <FieldContext.Provider value={value}>
      <div className={cn('flex min-w-0 flex-col gap-2', className)}>
        <FieldLabel htmlFor={controlId} className={labelClassName} optional={!required}>
          {label}
        </FieldLabel>
        {children}
        <FieldError id={value.errorId} message={error} />
        {hint ? (
          <p id={value.hintId} className="text-sm text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

function FieldLabel({
  htmlFor,
  optional,
  className,
  children,
}: {
  htmlFor?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <LabelPrimitive.Root htmlFor={htmlFor} className={cn('text-base font-bold text-foreground', className)}>
      {children}
      {optional ? <span className="font-normal text-muted"> ({es.a11y.optional})</span> : null}
    </LabelPrimitive.Root>
  );
}

/**
 * Mensaje de error junto al campo, con icono + texto (nunca solo color). Es una ayuda para corregir, no un regaño:
 * tamaño de texto normal, sin negrita y sin cajas rojas; aparece al salir del campo y se va solo al corregirlo.
 */
export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="flex items-start gap-2 text-sm text-error">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

interface CompactFieldProps {
  label: string;
  /** Icono decorativo a la izquierda. */
  icon?: ReactNode;
  /** Instrucción para lectores de pantalla (el diseño compacto no la muestra). */
  hint?: string;
  error?: string;
  required?: boolean;
  id: string;
  /** Deja espacio a la izquierda en pantallas medianas (p. ej. para el botón de intercambiar). */
  offsetStart?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Segmento de un buscador compacto: etiqueta pequeña siempre visible arriba, control que ocupa
 * todo el segmento (64 px de alto) y anillo de foco en el segmento completo.
 * El mensaje de error NO se dibuja aquí: el formulario lo coloca bajo el grupo con
 * <FieldError id={`${id}-error`} />, y este componente ya lo enlaza con aria-describedby.
 */
export function CompactField({
  label,
  icon,
  hint,
  error,
  required = false,
  id,
  offsetStart = false,
  className,
  children,
}: CompactFieldProps) {
  const value: FieldContextValue = {
    id,
    hintId: `${id}-hint`,
    errorId: `${id}-error`,
    hasHint: !!hint,
    invalid: !!error,
    required,
  };
  return (
    <FieldContext.Provider value={value}>
      <div
        className={cn(
          'relative min-w-0 rounded transition-colors duration-150 hover:bg-background motion-reduce:transition-none',
          'has-[:focus-visible]:z-10 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
          error && 'bg-error-tint hover:bg-error-tint',
          icon && '[&_input]:pl-12 [&_select]:pl-12',
          icon && offsetStart && 'sm:[&_input]:pl-16 sm:[&_select]:pl-16',
          className,
        )}
      >
        {icon ? (
          <span aria-hidden="true" className={cn('pointer-events-none absolute left-4 top-1/2 -translate-y-1/2', offsetStart && 'sm:left-8', error ? 'text-error' : 'text-muted')}>
            {icon}
          </span>
        ) : null}
        <LabelPrimitive.Root
          htmlFor={id}
          className={cn('pointer-events-none absolute top-2 z-[1] text-sm leading-none', icon ? 'left-12' : 'left-4', icon && offsetStart && 'sm:left-16', error ? 'font-bold text-error' : 'text-muted')}
        >
          {label}
        </LabelPrimitive.Root>
        {hint ? (
          <span id={value.hintId} className="sr-only">
            {hint}
          </span>
        ) : null}
        {children}
      </div>
    </FieldContext.Provider>
  );
}
