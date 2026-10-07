import { Check, DoorOpen, Lock, MoveVertical, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';

const t = es.seats;

function Sample({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-8 shrink-0 items-center justify-center rounded-b-sm rounded-t-md border-2 text-sm font-bold [&_svg]:size-4', className)}
    >
      {children}
    </span>
  );
}

/** Leyenda: cada estado con su muestra (icono + patrón) y su nombre en texto. */
export function SeatLegend() {
  const items: { key: string; label: string; sample: ReactNode }[] = [
    { key: 'free', label: t.legendFree, sample: <Sample className="border-input bg-surface">A</Sample> },
    {
      key: 'taken',
      label: t.legendTaken,
      sample: (
        <Sample className="border-border bg-[repeating-linear-gradient(135deg,rgb(var(--color-border))_0_3px,rgb(var(--color-surface))_3px_7px)] text-muted">
          <X strokeWidth={3} />
        </Sample>
      ),
    },
    { key: 'selected', label: t.legendSelected, sample: <Sample className="border-primary bg-primary text-primary-foreground"><Check strokeWidth={3} /></Sample> },
    { key: 'exit', label: t.legendExit, sample: <Sample className="border-input bg-surface"><DoorOpen /></Sample> },
    { key: 'extra', label: t.legendExtra, sample: <Sample className="border-input bg-surface"><MoveVertical /></Sample> },
    { key: 'other', label: t.legendOther, sample: <Sample className="border-dashed border-border bg-background text-muted"><Lock /></Sample> },
  ];
  return (
    <section aria-label={t.legendTitle} className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            {item.sample}
            {item.label}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        {t.exitNote} {t.wingNote}
      </p>
    </section>
  );
}
