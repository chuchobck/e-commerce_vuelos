import { XCircle } from 'lucide-react';
import { forwardRef } from 'react';
import { es, fmt } from '@/shared/i18n';

export interface SummaryError {
  /** id del control con el error (el enlace mueve el foco allí). */
  fieldId: string;
  message: string;
  label: string;
}

/**
 * Resumen de errores al enviar un formulario (WCAG 3.3.1 / 3.3.3).
 * Recibe el foco al aparecer; cada enlace lleva al campo con el problema.
 */
/**
 * `inline`: cada error recibe el id `<fieldId>-error`; así el mismo bloque sirve de resumen
 * y de descripción de cada campo (formularios compactos sin mensajes bajo cada control).
 */
export const ErrorSummary = forwardRef<HTMLDivElement, { errors: SummaryError[]; inline?: boolean }>(({ errors, inline = false }, ref) => {
  if (errors.length === 0) return null;
  const title = errors.length === 1 ? es.errors.summaryTitleOne : fmt(es.errors.summaryTitle, { count: errors.length });
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-title"
      className="flex gap-4 rounded border-2 border-l-8 border-error bg-error-tint p-4"
    >
      <XCircle aria-hidden="true" className="size-6 shrink-0 text-error" />
      <div className="flex flex-col gap-2">
        <h2 id="error-summary-title" className="text-lg">
          {title}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-6">
          {errors.map((e, i) => (
            <li key={`${e.fieldId}-${i}`} id={inline ? `${e.fieldId}-error` : undefined}>
              <a
                href={`#${e.fieldId}`}
                className="font-bold text-error"
                onClick={(event) => {
                  event.preventDefault();
                  const el = document.getElementById(e.fieldId);
                  el?.focus();
                  el?.scrollIntoView({ block: 'center' });
                }}
              >
                {e.label}: {e.message}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
});
ErrorSummary.displayName = 'ErrorSummary';
