import { useEffect, useRef, type ReactNode } from 'react';
import { es, fmt } from '@/shared/i18n';
import { BookingStep } from './BookingStep';
import { IdentifyStep } from './IdentifyStep';
import { IdleWarning } from './IdleWarning';
import { PassesStep, type KioskPassContext } from './PassesStep';
import { useIdleReset } from './useIdleReset';
import { useKioskFlow, type KioskStep } from './useKioskFlow';

const t = es.kiosk;
const STEPS: KioskStep[] = ['identify', 'booking', 'passes'];

interface KioskFlowProps {
  renderPass: (context: KioskPassContext) => ReactNode;
}

/**
 * Kiosko de check-in en tres pasos. Cada paso tiene su propio h1 y el foco se mueve a él al cambiar de paso. Tras 60 s sin
 * interacción avisa («¿Sigues ahí?», 15 s) y luego borra todo y vuelve al primer paso. Solo hay algo que borrar si ya hay una
 * reserva en pantalla o datos escritos; con el formulario vacío no se interrumpe a nadie.
 */
export function KioskFlow({ renderPass }: KioskFlowProps) {
  const { state, setPnr, setLastName, lookup, checkIn, viewPasses, backToBooking, reset } = useKioskFlow();
  const { step, session } = state;
  const hasData = step !== 'identify' || state.pnr !== '' || state.lastName !== '';
  const idle = useIdleReset(hasData, () => reset(t.idleNotice));
  const root = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // El foco pasa al h1 al cambiar de paso (no en la primera carga).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const heading = root.current?.querySelector<HTMLElement>('h1');
    heading?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [step]);

  const finish = () => reset(t.finishedNotice);
  const heading = step === 'identify' ? t.identify.heading : step === 'booking' ? t.booking.heading : t.passes.heading;
  const lead = step === 'identify' ? t.identify.lead : step === 'booking' ? t.booking.lead : t.passes.lead;

  return (
    <div ref={root} className="container-page flex flex-col gap-8 py-8 md:py-12">
      <div className="flex flex-col gap-3 print:hidden">
        <p className="text-lg font-bold text-primary">
          {fmt(t.stepLabel, { current: STEPS.indexOf(step) + 1, total: STEPS.length })} · {t.steps[step]}
        </p>
        <h1 tabIndex={-1} className="text-4xl outline-none md:text-5xl">
          {heading}
        </h1>
        <p className="text-xl text-muted">{lead}</p>
      </div>

      {step === 'identify' ? (
        <IdentifyStep pnr={state.pnr} lastName={state.lastName} busy={state.busy} error={state.error} notice={state.notice} onPnr={setPnr} onLastName={setLastName} onSubmit={lookup} />
      ) : null}
      {step === 'booking' && session ? (
        <BookingStep session={session} busy={state.busy} error={state.error} onCheckIn={checkIn} onViewPasses={viewPasses} onFinish={finish} />
      ) : null}
      {step === 'passes' && session ? (
        <PassesStep booking={session.booking} passes={state.passes} renderPass={renderPass} onPrint={() => window.print()} onBack={backToBooking} onFinish={finish} />
      ) : null}

      {idle.secondsLeft !== null ? <IdleWarning seconds={idle.secondsLeft} onStay={idle.dismiss} /> : null}
    </div>
  );
}
