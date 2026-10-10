// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboboxOption } from './combobox';

const OPTIONS: ComboboxOption[] = [
  { value: 'UIO', label: 'Quito (UIO)', detail: 'Mariscal Sucre', keywords: ['UIO'] },
  { value: 'GYE', label: 'Guayaquil (GYE)', keywords: ['GYE'] },
  { value: 'CUE', label: 'Cuenca (CUE)', keywords: ['CUE'] },
  { value: 'LOH', label: 'Loja (LOH)', keywords: ['LOH'], disabledReason: 'Sin vuelos desde Manta' },
];

afterEach(cleanup);

function Harness({ onChange, initial = '' }: { onChange?: (v: string) => void; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="c">Destino</label>
      <Combobox
        id="c"
        options={OPTIONS}
        value={value}
        onValueChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
        emptyText={(typed) => `No encontramos «${typed}»`}
        listLabel="Ciudades"
        countText={(n) => `${n} sugeridas`}
        clearLabel="Borrar"
      />
      <button type="button">otro</button>
    </>
  );
}

const box = () => screen.getByRole('combobox', { name: 'Destino' }) as HTMLInputElement;
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });

describe('campo con sugerencias', () => {
  it('al enfocar muestra las ciudades; al escribir filtra al instante sin importar tildes', () => {
    render(<Harness />);
    fireEvent.focus(box());
    expect(within(screen.getByRole('listbox', { name: 'Ciudades' })).getAllByRole('option')).toHaveLength(4);
    type('GUAYA');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Guayaquil (GYE)']);
    expect(box().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('1 sugeridas');
  });

  it('se elige con un clic y el campo muestra la ciudad', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(box());
    type('cu');
    fireEvent.click(screen.getByRole('option', { name: /Cuenca/ }));
    expect(onChange).toHaveBeenLastCalledWith('CUE');
    expect(box().value).toBe('Cuenca (CUE)');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('teclado: flechas, Enter, Escape y activedescendant', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(box());
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    const active = box().getAttribute('aria-activedescendant')!;
    expect(document.getElementById(active)!.textContent).toContain('Guayaquil');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('GYE');
    // Sin coincidencias lo dice; Escape cierra la lista sin borrar lo escrito.
    fireEvent.focus(box());
    type('xx');
    expect(screen.getAllByText('No encontramos «xx»').length).toBeGreaterThan(0);
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(box().getAttribute('aria-expanded')).toBe('false');
    expect(box().value).toBe('xx');
  });

  it('lo que no se puede elegir se ve con su motivo y no se elige', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(box());
    const loja = screen.getByRole('option', { name: /Loja/ });
    expect(loja.getAttribute('aria-disabled')).toBe('true');
    expect(loja.textContent).toContain('Sin vuelos desde Manta');
    fireEvent.click(loja);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('corrección al salir: una sola coincidencia se elige sola; si no coincide nada, avisa y no borra', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.focus(box());
    type('quito');
    fireEvent.blur(box(), { relatedTarget: screen.getByRole('button', { name: 'otro' }) });
    expect(onChange).toHaveBeenLastCalledWith('UIO');
    expect(box().value).toBe('Quito (UIO)');

    type('zzz');
    expect(onChange).toHaveBeenLastCalledWith('');
    fireEvent.blur(box(), { relatedTarget: screen.getByRole('button', { name: 'otro' }) });
    expect(box().value).toBe('zzz');
  });

  it('escribir tras elegir vacía el valor hasta elegir otra vez; "Borrar" limpia y devuelve el foco', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial="UIO" />);
    expect(box().value).toBe('Quito (UIO)');
    type('Quit');
    expect(onChange).toHaveBeenLastCalledWith('');
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    expect(box().value).toBe('');
    expect(document.activeElement).toBe(box());
  });
});
