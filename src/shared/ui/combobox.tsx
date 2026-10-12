import { Check, X } from 'lucide-react';
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { normalizeSearch, rankMatches, splitMatch } from '@/shared/lib/searchText';
import { useFieldControl } from './field';
import { bareControlClasses, controlClasses } from './input';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Segunda línea (p. ej. el aeropuerto). */
  detail?: string;
  /** Otras palabras por las que se encuentra la opción. */
  keywords?: readonly string[];
  icon?: ReactNode;
  /** Se muestra pero no se puede elegir, con el motivo a la vista. */
  disabledReason?: string;
}

export interface ComboboxProps {
  options: readonly ComboboxOption[];
  /** Valor elegido (`''` = nada). Escribir otra cosa lo vacía hasta que se elija una opción. */
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  placeholder?: string;
  variant?: 'default' | 'bare';
  /** Texto cuando lo escrito no coincide con nada. Recibe lo escrito. */
  emptyText: (typed: string) => string;
  /** Nombre accesible de la lista de sugerencias. */
  listLabel: string;
  /** Anuncio para lectores de pantalla con la cantidad de sugerencias. */
  countText: (count: number) => string;
  /** Texto del botón que borra lo escrito. */
  clearLabel: string;
  autoComplete?: string;
  /** id del campo (si no está dentro de un <Field>). */
  id?: string;
}

/**
 * Campo con sugerencias (patrón combobox de WAI-ARIA, lista autocompletada): se escribe, la lista se
 * filtra al instante (sin tildes ni mayúsculas) y se elige con clic, toque o teclado
 * (↑ ↓ Enter, Esc, Inicio/Fin). Al salir del campo, si lo escrito coincide con una sola opción se elige
 * solo; si no coincide con ninguna se avisa sin borrar lo escrito.
 */
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  { options, value, onValueChange, onBlur, name, placeholder, variant = 'default', emptyText, listLabel, countText, clearLabel, autoComplete = 'off', id },
  ref,
) {
  const field = useFieldControl();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  const selected = options.find((o) => o.value === value);
  const [text, setText] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Mientras el usuario escribe se filtra por lo escrito; con una opción ya elegida y sin tocar el texto, se muestra todo.
  const [filtering, setFiltering] = useState(false);

  // El valor cambió desde fuera (intercambiar, prellenar, limpiar): el texto lo sigue.
  // Si el valor se vació porque el usuario siguió escribiendo, el texto se respeta.
  const emittedEmpty = useRef(false);
  useEffect(() => {
    if (!selected && emittedEmpty.current) {
      emittedEmpty.current = false;
      return;
    }
    emittedEmpty.current = false;
    setText(selected?.label ?? '');
    setFiltering(false);
    // Solo cuando cambia el valor o su etiqueta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.label, value]);

  const matches = useMemo(() => (filtering ? rankMatches(options, text) : [...options]), [options, text, filtering]);
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  const optionId = (i: number) => `${listId}-o${i}`;

  const choose = (option: ComboboxOption) => {
    if (option.disabledReason) return;
    setText(option.label);
    setFiltering(false);
    setOpen(false);
    if (option.value !== value) onValueChange(option.value);
  };

  const onType = (next: string) => {
    setText(next);
    setFiltering(true);
    setOpen(true);
    setActive(0);
    if (value) {
      emittedEmpty.current = true;
      onValueChange('');
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) return setOpen(true);
        setActive((i) => Math.min(matches.length - 1, i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) return setOpen(true);
        setActive((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        if (open && matches.length > 0 && event.ctrlKey) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (open && matches.length > 0 && event.ctrlKey) {
          event.preventDefault();
          setActive(matches.length - 1);
        }
        break;
      case 'Enter':
        if (open && matches[activeIndex]) {
          event.preventDefault();
          choose(matches[activeIndex]);
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setText(selected?.label ?? text);
          setFiltering(false);
        }
        break;
      default:
        break;
    }
  };

  const onFocus = () => {
    inputRef.current?.select();
    setOpen(true);
  };

  const onFocusOut = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOpen(false);
    // Corrección al salir: una sola coincidencia exacta o única se elige sola.
    if (!value && text.trim()) {
      const q = normalizeSearch(text);
      const exact = options.filter((o) => !o.disabledReason && normalizeSearch(o.label) === q);
      const only = exact.length === 1 ? exact : rankMatches(options, text).filter((o) => !o.disabledReason);
      if (only.length === 1) choose(only[0]);
    }
    onBlur?.();
  };

  const showClear = text !== '';

  return (
    <div className="group relative" onBlur={onFocusOut}>
      <input
        ref={inputRef}
        {...field}
        id={id ?? field.id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={open && matches.length > 0 ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[activeIndex] ? optionId(activeIndex) : undefined}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        placeholder={placeholder}
        value={text}
        onChange={(e) => onType(e.target.value)}
        onFocus={onFocus}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={cn(variant === 'bare' ? bareControlClasses : controlClasses, variant === 'bare' ? 'pr-12' : 'pr-12', 'truncate')}
      />
      {showClear ? (
        <button
          type="button"
          aria-label={clearLabel}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setText('');
            setFiltering(false);
            if (value) {
              emittedEmpty.current = true;
              onValueChange('');
            }
            inputRef.current?.focus();
          }}
          className="absolute right-0 top-1/2 z-[2] hidden size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-foreground focus-visible:flex group-focus-within:flex"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}

      <p role="status" className="sr-only">
        {open ? (matches.length > 0 ? countText(matches.length) : emptyText(text)) : ''}
      </p>

      {open && matches.length === 0 ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-[max(100%,min(18rem,calc(100vw-4rem)))] rounded border-2 border-border bg-surface px-4 py-4 text-muted shadow-raised">
          {emptyText(text)}
        </div>
      ) : null}

      {open && matches.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="absolute left-0 top-full z-40 mt-2 max-h-80 w-[max(100%,min(18rem,calc(100vw-4rem)))] overflow-auto rounded border-2 border-border bg-surface py-2 shadow-raised"
        >
          {matches.map((option, index) => {
            const [before, hit, after] = filtering ? splitMatch(option.label, text) : [option.label, '', ''];
            const disabled = !!option.disabledReason;
            return (
              // El teclado actúa desde el campo (aria-activedescendant); la opción solo recibe el clic o el toque.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={disabled || undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex min-h-12 cursor-pointer items-center gap-4 px-4 py-2',
                  index === activeIndex && !disabled && 'bg-primary-tint',
                  index === activeIndex && 'outline outline-2 -outline-offset-2 outline-focus',
                  disabled && 'cursor-not-allowed text-muted',
                )}
              >
                {option.icon ? <span aria-hidden="true" className="shrink-0 text-primary">{option.icon}</span> : null}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base">
                    {before}
                    {hit ? <mark className="bg-transparent font-bold text-foreground underline decoration-2 underline-offset-4">{hit}</mark> : null}
                    {after}
                  </span>
                  {option.detail || option.disabledReason ? (
                    <span className="truncate text-sm text-muted">{option.disabledReason ?? option.detail}</span>
                  ) : null}
                </span>
                {option.value === value ? <Check aria-hidden="true" className="size-6 shrink-0 text-primary" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});
