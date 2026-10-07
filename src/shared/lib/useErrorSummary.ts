import { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldErrors, FieldValues } from 'react-hook-form';
import type { SummaryError } from '@/shared/ui/error-summary';

export type FieldMeta<T> = { [K in keyof T]?: { id: string; label: string } };

/**
 * Resumen de errores para formularios con react-hook-form:
 *  - al enviar con errores, muestra el resumen y le da el foco;
 *  - mientras el usuario corrige, el resumen se actualiza sin robar el foco.
 * `fields` define el orden, el id del control y la etiqueta de cada campo.
 */
export function useErrorSummary<T extends FieldValues>(fields: FieldMeta<T>, errors: FieldErrors<T>, isSubmitted: boolean) {
  const [summary, setSummary] = useState<SummaryError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const build = useCallback((errs: FieldErrors<T>): SummaryError[] => {
    const meta = fieldsRef.current;
    return (Object.keys(meta) as (keyof T)[]).flatMap((key) => {
      const message = errs[key]?.message;
      const m = meta[key];
      return typeof message === 'string' && m ? [{ fieldId: m.id, label: m.label, message }] : [];
    });
  }, []);

  useEffect(() => {
    if (attempt > 0) ref.current?.focus();
  }, [attempt]);

  // Mantiene el resumen al día mientras se corrigen los campos.
  const signature = Object.entries(errors)
    .map(([k, v]) => `${k}:${(v as { message?: string } | undefined)?.message ?? ''}`)
    .join('|');
  useEffect(() => {
    if (isSubmitted) setSummary(build(errors));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, isSubmitted, build]);

  const onInvalid = useCallback(
    (errs: FieldErrors<T>) => {
      setSummary(build(errs));
      setAttempt((n) => n + 1);
    },
    [build],
  );

  const clear = useCallback(() => setSummary([]), []);

  return { summary, summaryRef: ref, onInvalid, clear };
}
