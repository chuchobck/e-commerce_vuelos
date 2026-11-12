import { useEffect, useRef } from 'react';
import { es, fmt } from '@/shared/i18n';
import { Button } from '@/shared/ui';
import { IDLE_WARNING_SECONDS } from './useIdleReset';

const t = es.kiosk.idle;

interface IdleWarningProps {
  seconds: number;
  onStay: () => void;
}

/** «¿Sigues ahí?» con cuenta regresiva. El foco va al botón; cualquier interacción también cancela el borrado. */
export function IdleWarning({ seconds, onStay }: IdleWarningProps) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/70 p-4 print:hidden">
      <div role="alertdialog" aria-modal="true" aria-labelledby="kiosk-idle-title" aria-describedby="kiosk-idle-text" className="flex w-full max-w-lg flex-col gap-4 rounded border-2 border-primary bg-surface p-8 shadow-card">
        <h2 id="kiosk-idle-title" className="text-3xl">
          {t.title}
        </h2>
        <p id="kiosk-idle-text" className="text-lg">
          {fmt(t.text, { seconds: IDLE_WARNING_SECONDS })}
        </p>
        <p aria-hidden="true" className="text-center text-6xl font-bold tabular-nums">
          {seconds}
        </p>
        <Button ref={button} size="lg" className="min-h-16 text-xl" onClick={onStay}>
          {t.stay}
        </Button>
      </div>
    </div>
  );
}
