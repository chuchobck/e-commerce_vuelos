import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Card } from '@/shared/ui';
import { anySeatChosen, type SeatLine } from './seatLines';

const f = es.checkoutForms;

interface SeatsBlockProps {
  /** Resumen de lo elegido (visible aun plegado). */
  lines: SeatLine[];
  /** Fuerza abrirlo (p. ej. tras un 409 de asiento ocupado). */
  forceOpen?: boolean;
  /** El selector. Solo se monta con el bloque abierto: sin abrirlo no se pide ningún mapa. */
  children: ReactNode;
}

/**
 * Elegir asientos es OPCIONAL: el bloque nace plegado con "Asignaremos tus asientos
 * automáticamente. Elegir asientos (opcional)" y el camino de la compra no suma ningún clic.
 */
export function SeatsBlock({ lines, forceOpen = false, children }: SeatsBlockProps) {
  const [open, setOpen] = useState(forceOpen);
  const panelId = useId();
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  const chosen = anySeatChosen(lines);

  return (
    // Sin título propio: abierto, el selector trae el suyo ("Elige tus asientos"); plegado, basta el texto.
    <Card role="group" aria-label={f.seatsTitle} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* El texto no se encoge por debajo de 14rem: en pantallas angostas el botón baja a la línea siguiente. */}
        <p className="min-w-[14rem] flex-1 text-muted">{chosen ? f.seatsChosenIntro : f.seatsAutoText}</p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-12 items-center gap-2 rounded border-2 border-primary px-4 font-bold text-primary hover:bg-primary-tint"
        >
          {open ? f.seatsHide : chosen ? f.seatsChange : f.seatsChoose}
          <ChevronDown aria-hidden="true" className={cn('size-5', open && 'rotate-180')} />
        </button>
      </div>
      {chosen ? (
        <ul className="flex flex-col gap-1">
          {lines.map((l) => (
            <li key={l.passengerId}>
              <span className="font-bold">{l.name || l.passengerId}:</span> {l.text}
            </li>
          ))}
        </ul>
      ) : null}
      <div id={panelId} hidden={!open}>
        {open ? children : null}
      </div>
    </Card>
  );
}
