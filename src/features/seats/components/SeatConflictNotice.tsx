import { es, fmt } from '@/shared/i18n';
import { Alert, Button } from '@/shared/ui';
import type { SeatConflict } from '../types';

const t = es.seats;

interface SeatConflictNoticeProps {
  conflict: SeatConflict;
  segmentLabel: string;
  cabinLabel: string;
  onUseAlternative: (conflict: SeatConflict) => void;
  onShowCabin: (conflict: SeatConflict) => void;
  onDismiss: (conflict: SeatConflict) => void;
}

/**
 * Explica un asiento que dejó de servir (ocupado o de otra cabina) en lenguaje simple, dice que las
 * demás elecciones se conservan y propone el asiento libre más cercano.
 */
export function SeatConflictNotice({ conflict, segmentLabel, cabinLabel, onUseAlternative, onShowCabin, onDismiss }: SeatConflictNoticeProps) {
  const taken = conflict.kind === 'SEAT_TAKEN';
  const text = taken
    ? conflict.seatNumber
      ? fmt(t.conflictTaken, { seat: conflict.seatNumber, segment: segmentLabel })
      : t.conflictTakenUnknown
    : conflict.seatNumber
      ? fmt(t.conflictCabin, { seat: conflict.seatNumber, segment: segmentLabel, cabin: cabinLabel })
      : t.conflictCabinUnknown;
  return (
    <Alert
      variant="warning"
      live="assertive"
      title={taken ? t.conflictTakenTitle : t.conflictCabinTitle}
      action={
        <div className="flex flex-wrap gap-2">
          {conflict.alternative && conflict.passengerId ? (
            <Button variant="primary" onClick={() => onUseAlternative(conflict)}>
              {fmt(t.conflictAlternative, { seat: conflict.alternative })}
            </Button>
          ) : null}
          {!taken ? (
            <Button variant="secondary" onClick={() => onShowCabin(conflict)}>
              {fmt(t.conflictShowCabin, { cabin: cabinLabel })}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onDismiss(conflict)}>
            {taken ? t.conflictAuto : t.conflictDismiss}
          </Button>
        </div>
      }
    >
      <p>{text}</p>
      {taken && conflict.alternative ? <p>{fmt(t.conflictAlternativeHint, { seat: conflict.alternative })}</p> : null}
    </Alert>
  );
}
