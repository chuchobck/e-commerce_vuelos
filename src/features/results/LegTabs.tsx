import { Check, Lock } from 'lucide-react';
import { type KeyboardEvent } from 'react';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';

export interface LegTab {
  id: 'out' | 'in';
  /** 1 para la ida, 2 para la vuelta. */
  number: number;
  title: string;
  route: string;
  date: string;
  /** Lo que ya se eligió en este paso ("06:30 · Basic · $56,45 por persona"). */
  chosen?: string;
  /** Por qué no se puede abrir todavía. */
  blocked?: string;
}

interface LegTabsProps {
  tabs: LegTab[];
  activeId: LegTab['id'];
  panelId: string;
  onSelect: (id: LegTab['id']) => void;
}

/**
 * Ida y vuelta en dos espacios, en el centro de la pantalla: se elige la ida y se pasa sola a la vuelta.
 * Cada pestaña dice qué se eligió y se puede volver a cambiar. La vuelta se abre cuando hay ida.
 */
export function LegTabs({ tabs, activeId, panelId, onSelect }: LegTabsProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const target = tabs[(index + delta + tabs.length) % tabs.length];
    if (target.blocked) return;
    onSelect(target.id);
    document.getElementById(`${panelId}-tab-${target.id}`)?.focus();
  };

  return (
    <div role="tablist" aria-label={es.results.legsLabel} className="mx-auto grid w-full max-w-4xl gap-4 sm:grid-cols-2">
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;
        const blocked = !!tab.blocked;
        return (
          <button
            key={tab.id}
            id={`${panelId}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            aria-disabled={blocked || undefined}
            aria-describedby={blocked ? `${panelId}-blocked-${tab.id}` : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => !blocked && onSelect(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'flex min-h-14 items-start gap-4 rounded border-2 p-4 text-left',
              active ? 'border-primary bg-primary-tint shadow-card' : 'border-border bg-surface',
              !active && !blocked && 'hover:border-primary',
              blocked && 'cursor-not-allowed text-muted',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-base font-bold',
                tab.chosen ? 'border-success bg-success text-success-foreground' : active ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
              )}
            >
              {tab.chosen ? <Check className="size-4" strokeWidth={3} /> : blocked ? <Lock className="size-4" /> : tab.number}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-lg font-bold">
                {tab.title} · {tab.route}
              </span>
              <span className="text-sm">{tab.date}</span>
              {tab.chosen ? (
                <span className="text-sm font-bold text-foreground">
                  {tab.chosen}
                  {!active ? <span className="font-normal text-primary"> · {es.results.changeChoice}</span> : null}
                </span>
              ) : null}
              {blocked ? (
                <span id={`${panelId}-blocked-${tab.id}`} className="text-sm">
                  {tab.blocked}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
