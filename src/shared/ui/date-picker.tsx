import * as Popover from '@radix-ui/react-popover';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { es, fmt } from '@/shared/i18n';
import { dateLocale, maskDateInput, parseDisplayDate, toDisplayDate } from '@/shared/lib/dates';
import { Input, type InputProps } from './input';

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
            <DayPicker
              mode="single"
              // Al abrir el calendario el foco debe entrar en él (WCAG 2.4.3); no es un autofoco al cargar la página.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              locale={dateLocale}
              selected={selected}
              defaultMonth={selected ?? minDate}
              startMonth={minDate}
              endMonth={maxDate}
              disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
              onSelect={(date) => {
                if (date) onValueChange(toDisplayDate(date));
                setOpen(false);
              }}
              components={{
                Chevron: ({ orientation }) =>
                  orientation === 'left' ? (
                    <ChevronLeft aria-hidden="true" className="size-6" />
                  ) : (
                    <ChevronRight aria-hidden="true" className="size-6" />
                  ),
              }}
              classNames={{
                root: 'relative',
                months: 'flex flex-col',
                month: 'flex flex-col gap-4',
                month_caption: 'flex h-12 items-center px-2',
                caption_label: 'text-lg font-bold capitalize',
                nav: 'absolute right-0 top-0 flex gap-2',
                button_previous:
                  'inline-flex size-12 items-center justify-center rounded text-primary hover:bg-primary-tint disabled:text-muted disabled:hover:bg-transparent',
                button_next:
                  'inline-flex size-12 items-center justify-center rounded text-primary hover:bg-primary-tint disabled:text-muted disabled:hover:bg-transparent',
                month_grid: 'border-collapse',
                weekdays: '',
                weekday: 'size-12 text-sm font-bold capitalize text-muted',
                week: '',
                day: 'p-0 text-center',
                day_button:
                  'inline-flex size-12 items-center justify-center rounded text-base hover:bg-primary-tint disabled:cursor-not-allowed disabled:text-muted disabled:line-through disabled:hover:bg-transparent',
                selected: '[&>button]:bg-primary [&>button]:font-bold [&>button]:text-primary-foreground [&>button:hover]:bg-primary-hover',
                today: '[&>button]:font-bold [&>button]:underline [&>button]:underline-offset-4',
                outside: 'text-muted',
                disabled: '',
                hidden: 'invisible',
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
DatePicker.displayName = 'DatePicker';
