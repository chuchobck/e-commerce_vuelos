// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Field } from './field';
import { Input } from './input';

afterEach(cleanup);

describe('campo de formulario', () => {
  it('el control va justo debajo de la etiqueta y la ayuda debajo del control: dos campos vecinos quedan alineados', () => {
    render(
      <Field id="a" label="Número de vuelo" hint="Una ayuda larga que ocupa varias líneas en una columna angosta" required>
        <Input />
      </Field>,
    );
    const label = screen.getByText('Número de vuelo');
    const input = screen.getByLabelText(/Número de vuelo/);
    const hint = screen.getByText(/Una ayuda larga/);
    const order = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(order(label, input)).toBe(true);
    expect(order(input, hint)).toBe(true);
  });

  it('el error se ve con icono y texto normal (sin negrita ni cajas), ligado al control, antes de la ayuda', () => {
    render(
      <Field id="b" label="Nombres" hint="Solo letras" error="Escribe solo letras y espacios." required>
        <Input />
      </Field>,
    );
    const error = screen.getByRole('alert');
    expect(error.textContent).toBe('Escribe solo letras y espacios.');
    expect(error.className).not.toMatch(/font-bold/);
    const input = screen.getByLabelText(/Nombres/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('b-error b-hint');
    expect(Boolean(error.compareDocumentPosition(screen.getByText('Solo letras')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('marca "(opcional)" solo en los campos no obligatorios', () => {
    render(
      <>
        <Field id="c" label="Motivo">
          <Input />
        </Field>
        <Field id="d" label="Correo" required>
          <Input />
        </Field>
      </>,
    );
    expect(screen.getByText(/\(opcional\)/)).toBeTruthy();
    expect(screen.getAllByText(/\(opcional\)/)).toHaveLength(1);
  });
});
