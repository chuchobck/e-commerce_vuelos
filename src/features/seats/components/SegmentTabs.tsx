import { type KeyboardEvent } from 'react';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';

const t = es.seats;

export interface SegmentTab {
  id: string;
  label: string;
  route: string;
  /** "1 de 2 con asiento" o "Automático". */
  status: string;
}

interface SegmentTabsProps {
  tabs: SegmentTab[];
  activeId: string;
  panelId: string;
  onSelect: (id: string) => void;
}

/** Pestañas Ida / Vuelta / Escalas con las flechas (patrón de pestañas de WAI-ARIA). */
export function SegmentTabs({ tabs, activeId, panelId, onSelect }: SegmentTabsProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[
      event.key as 'ArrowRight' | 'ArrowLeft' | 'Home' | 'End'
    ];
    if (target === undefined) return;
    event.preventDefault();
    onSelect(tabs[target].id);
    document.getElementById(`${panelId}-tab-${tabs[target].id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={t.segmentsLabel} className="flex gap-2 overflow-x-auto pb-2">
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            id={`${panelId}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'flex min-h-12 shrink-0 flex-col items-start justify-center rounded border-2 px-4 py-2 text-left text-sm',
              active ? 'border-primary bg-primary-tint' : 'border-input bg-surface hover:bg-primary-tint',
            )}
          >
            <span className="font-bold">
              {tab.label}
              <span className="font-normal"> · {tab.route}</span>
            </span>
            <span className="text-muted">{tab.status}</span>
          </button>
        );
      })}
    </div>
  );
}
