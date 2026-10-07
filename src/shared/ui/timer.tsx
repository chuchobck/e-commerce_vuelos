import { Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { formatCountdown } from '@/shared/lib/format';
import { Button } from './button';

/** A partir de este umbral se muestra el aviso y se anuncia de forma asertiva. */
const TIMER_WARNING_SECONDS = 120;
/** Primer aviso, cortés: quedan 5 minutos. */
const TIMER_HEADS_UP_SECONDS = 300;

interface TimerProps {
  /**
   * Momento en que termina el tiempo, en el reloj de ESTE equipo (Date.now()). Se calcula con el
   * tiempo restante que da el servidor, nunca comparando la hora del servidor con la local.
   */
  deadline: number;
  onExpire?: () => void;
  /** Si se pasa, muestra "Necesito más tiempo" durante el aviso (WCAG 2.2.1). */
  onExtend?: () => void;
  extending?: boolean;
  className?: string;
}

function secondsLeft(deadline: number) {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/**
 * Cuenta regresiva de la reserva temporal.
 * - Los segundos visibles NO se anuncian (sería ruido constante).
 * - A los 5 minutos, una región cortés (aria-live="polite") anuncia y muestra el primer aviso.
 * - A los 2 minutos aparece un aviso visible y se anuncia de forma asertiva una sola vez.
 */
export function Timer({ deadline, onExpire, onExtend, extending = false, className }: TimerProps) {
  const [left, setLeft] = useState(() => secondsLeft(deadline));
  const [announcement, setAnnouncement] = useState('');
  const expired = useRef(false);
  const headsUpGiven = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expired.current = false;
    headsUpGiven.current = false;
    setAnnouncement('');
    const tick = () => {
      const s = secondsLeft(deadline);
      setLeft(s);
      if (s <= TIMER_HEADS_UP_SECONDS && s > TIMER_WARNING_SECONDS && !headsUpGiven.current) {
        headsUpGiven.current = true;
        setAnnouncement(es.timer.headsUp);
      }
      if (s <= TIMER_WARNING_SECONDS) setAnnouncement('');
      if (s <= 0 && !expired.current) {
        expired.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadline]);

  const warning = left > 0 && left <= TIMER_WARNING_SECONDS;
  const done = left <= 0;

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded border-2 p-4',
        done ? 'border-error bg-error-tint' : warning ? 'border-warning bg-warning-tint' : 'border-border bg-surface',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <Clock aria-hidden="true" className={cn('size-6', done ? 'text-error' : warning ? 'text-warning' : 'text-primary')} />
        <p className="flex flex-col">
          <span className="text-sm text-muted">{es.timer.label}</span>
          {/* role="timer" tiene aria-live="off" implícito: el valor se lee solo al llegar a él. */}
          <span role="timer" className="text-2xl font-bold tabular-nums">
            {done ? es.timer.expired : formatCountdown(left)}
          </span>
        </p>
      </div>

      {/* Región cortés del primer aviso (5 minutos): siempre montada para que se anuncie al llenarse. */}
      <p aria-live="polite" aria-atomic="true" className={announcement ? 'text-sm font-bold' : 'sr-only'}>
        {announcement}
      </p>

      {/* El aviso de 2 minutos se monta una sola vez con role="alert" (asertivo). */}
      {warning ? (
        <div role="alert" className="flex flex-col gap-2">
          <p className="font-bold">{es.timer.warningTitle}</p>
          <p>{es.timer.warningText}</p>
          {onExtend ? (
            <div>
              <Button variant="secondary" onClick={onExtend} loading={extending}>
                {es.timer.extend}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
