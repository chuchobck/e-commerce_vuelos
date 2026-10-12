import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { dateLocale, toDisplayDate } from '@/shared/lib/dates';

export interface CalendarPanelProps {
  selected: Date | undefined;
  minDate?: Date;
  maxDate?: Date;
  /** Recibe la fecha elegida con el formato visible "dd/mm/aaaa". */
  onPick: (displayDate: string) => void;
}

/** El calendario del selector de fecha. Va en su propio archivo: la librería solo se descarga cuando alguien lo abre. */
export function CalendarPanel({ selected, minDate, maxDate, onPick }: CalendarPanelProps) {
  return (
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
        if (date) onPick(toDisplayDate(date));
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
  );
}
