import { ArrowLeft, LogOut, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BoardingPass, KioskBooking, KioskFlight } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Alert, Button } from '@/shared/ui';

const t = es.kiosk.passes;

export interface KioskPassContext {
  pass: BoardingPass;
  passengerName: string;
  flight: KioskFlight | undefined;
}

interface PassesStepProps {
  booking: KioskBooking;
  passes: BoardingPass[];
  /** Cómo se dibuja cada pase: lo aporta la página para reutilizar el componente del e-commerce (un módulo no importa de otro). */
  renderPass: (context: KioskPassContext) => ReactNode;
  onPrint: () => void;
  onBack: () => void;
  onFinish: () => void;
}

/**
 * Paso 3: los pases de abordar. «Imprimir» y los botones quedan fuera de la hoja impresa (`print:hidden`): la página que lo monta
 * oculta también el resto del kiosko, así que sale solo cada pase.
 */
export function PassesStep({ booking, passes, renderPass, onPrint, onBack, onFinish }: PassesStepProps) {
  const nameOf = (id: string) => {
    const p = booking.passengers.find((x) => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : '';
  };
  const order = booking.passengers.map((p) => p.id);
  const sorted = [...passes].sort((a, b) => order.indexOf(a.passengerId) - order.indexOf(b.passengerId));
  return (
    <div className="flex flex-col gap-6">
      {sorted.length === 0 ? (
        <Alert variant="info" live="polite">
          <p>{t.empty}</p>
        </Alert>
      ) : (
        <>
          <div className="flex flex-col items-start gap-2 print:hidden">
            <Button size="lg" className="min-h-16 text-xl" onClick={onPrint}>
              <Printer aria-hidden="true" />
              {t.print}
            </Button>
            <p className="text-sm text-muted">{t.printHint}</p>
          </div>
          <ul aria-label={t.listLabel} className="flex flex-col gap-6">
            {sorted.map((pass) => (
              <li key={`${pass.passengerId}-${pass.segmentId}`}>
                {renderPass({ pass, passengerName: nameOf(pass.passengerId), flight: booking.flights.find((f) => f.segmentId === pass.segmentId) })}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap gap-3 print:hidden">
        <Button variant="secondary" size="lg" className="min-h-14" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {t.back}
        </Button>
        <Button size="lg" className="min-h-14" onClick={onFinish}>
          <LogOut aria-hidden="true" />
          {t.finish}
        </Button>
      </div>
    </div>
  );
}
