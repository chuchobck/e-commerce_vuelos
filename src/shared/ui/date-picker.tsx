import * as Popover from '@radix-ui/react-popover';
import { CalendarDays } from 'lucide-react';
import { forwardRef, lazy, Suspense, useState } from 'react';
import { es, fmt } from '@/shared/i18n';
import { maskDateInput, parseDisplayDate } from '@/shared/lib/dates';
import { Input, type InputProps } from './input';

// react-day-picker pesa más que todo el selector: se descarga la primera vez que se abre el calendario.
const CalendarPanel = lazy(() => import('./calendar-panel').then((m) => ({ default: m.CalendarPanel })));

export interface DatePickerProps extends Omit<InputProps, 'value' | 'onChange' | 'endAdornment' | 'type'> {
  /** Valor visible "dd/mm/aaaa" (puede estar incompleto mientras se escribe). */
  value: string;
  onValueChange: (value: string) => void;
  /** Nombre corto del campo para el botón de calendario, p. ej. "fecha de ida". */
  calendarLabel: string;
  minDate?: Date;
  maxDate?: Date;
}

/**
 * Selector de fecha accesible en dos vías:
 *  1. Escribir la fecha (la máscara inserta las barras; nada de lo escrito se borra).
 *  2. Abrir el calendario con el botón de 48 px; se navega con flechas, Re Pág/Av Pág y Esc.
 * Al elegir un día el calendario se cierra y el foco vuelve al botón.
 */
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ value, onValueChange, calendarLabel, minDate, maxDate, disabled, ...props }, ref) => {
    const [open, setOpen] = useState(false);
    const selected = parseDisplayDate(value) ?? undefined;
    const buttonLabel = fmt(es.common.openCalendar, { label: calendarLabel });

    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Input
          ref={ref}
          {...props}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          maxLength={10}
          value={value}
          onChange={(e) => onValueChange(maskDateInput(e.target.value))}
          endAdornment={
            <Popover.Trigger asChild disabled={disabled}>
              <button
                type="button"
                aria-label={buttonLabel}
                className="mr-px inline-flex size-12 items-center justify-center rounded text-primary hover:bg-primary-tint disabled:cursor-not-allowed disabled:text-muted"
              >
                <CalendarDays aria-hidden="true" className="size-6" />
              </button>
            </Popover.Trigger>
          }
        />
        <Popover.Portal>
          <Popover.Content
            aria-label={buttonLabel}
            align="end"
            sideOffset={8}
            collisionPadding={16}
            // El foco va al día seleccionado (autoFocus de DayPicker), no al primer botón.
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="z-50 rounded border-2 border-border bg-surface p-4 shadow-raised animate-fade-in"
          >
            <Suspense fallback={<div role="status" className="flex h-96 w-80 items-center justify-center text-muted">{es.a11y.loading}</div>}>
              <CalendarPanel
                selected={selected}
                minDate={minDate}
                maxDate={maxDate}
                onPick={(date) => {
                  onValueChange(date);
                  setOpen(false);
                }}
              />
            </Suspense>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
DatePicker.displayName = 'DatePicker';
