import { CheckCircle2, Info } from 'lucide-react';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { joinList } from '@/shared/lib/joinList';

/** Cuántos pendientes se nombran antes de resumir el resto ("y 2 más"). */
const MAX_NAMED = 3;

function named(items: readonly string[]): string {
  if (items.length <= MAX_NAMED) return joinList(items);
  return `${items.slice(0, MAX_NAMED).join(', ')} ${fmt(es.forms.more, { count: items.length - MAX_NAMED })}`;
}

interface FormStatusProps {
  /** id del párrafo: el botón de enviar lo enlaza con aria-describedby. */
  id: string;
  /** Todo está completo y correcto: el botón se puede usar. */
  ready: boolean;
  /** Campos todavía vacíos (con su nombre en minúsculas). */
  missing?: readonly string[];
  /** Campos con algo escrito que hay que corregir. */
  invalid?: readonly string[];
  /** Texto cuando ya está listo; por defecto, el general de los formularios. */
  readyText?: string;
  className?: string;
}

/**
 * Estado de un formulario junto a su botón de enviar: qué falta, qué revisar o que ya se puede continuar. Reemplaza al
 * resumen de errores de la versión anterior: el usuario ve en todo momento lo que le falta, con un tono tranquilo, y el
 * botón solo se activa cuando no queda nada pendiente, así que nunca hace falta "equivocarse" para enterarse. Se anuncia
 * con aria-live (`role="status"`, cortés) y no interrumpe.
 */
export function FormStatus({ id, ready, missing = [], invalid = [], readyText = es.forms.ready, className }: FormStatusProps) {
  return (
    <p id={id} role="status" className={cn('flex items-start gap-2 text-sm', ready ? 'text-success' : 'text-muted', className)}>
      {ready ? (
        <>
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{readyText}</span>
        </>
      ) : (
        <>
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            {missing.length > 0 ? fmt(es.forms.missing, { fields: named(missing) }) : null}
            {missing.length > 0 && invalid.length > 0 ? ' ' : null}
            {invalid.length > 0 ? fmt(es.forms.invalid, { fields: named(invalid) }) : null}
          </span>
        </>
      )}
    </p>
  );
}
