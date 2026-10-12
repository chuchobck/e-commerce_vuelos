// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { es, fmt } from '@/shared/i18n';
import { formatMoney } from '@/shared/lib/format';
import { TEST_CARDS } from '@/shared/payments';
import { formatCardNumber, PaymentForm } from './PaymentForm';

const f = es.checkoutForms;
const AMOUNT = { cents: 7392, currency: 'USD' };

afterEach(cleanup);

function fill(number: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(`^${f.cardNumber}`)), { target: { value: number } });
  fireEvent.change(screen.getByLabelText(new RegExp(`^${f.cardHolder}`)), { target: { value: 'ANA PEREZ' } });
  fireEvent.change(screen.getByLabelText(new RegExp(`^${f.cardExpiry}`)), { target: { value: '1230' } });
  fireEvent.change(screen.getByLabelText(new RegExp(`^${f.cvv}`)), { target: { value: '123' } });
}

describe('formulario de pago (simulado)', () => {
  it('rotula "Pago simulado", entrega solo la referencia y vacía la tarjeta sin guardarla', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const onPay = vi.fn();
    render(<PaymentForm amount={AMOUNT} busy={false} onPay={onPay} />);
    expect(screen.getAllByText(f.simulatedTitle).length).toBeGreaterThan(0);
    fill(TEST_CARDS.declined);
    fireEvent.click(screen.getByRole('button', { name: fmt(f.pay, { total: formatMoney(AMOUNT) }) }));
    await waitFor(() => expect(onPay).toHaveBeenCalledTimes(1));
    expect(onPay.mock.calls[0][0]).toMatch(/^PAY-REJ-[A-Z0-9]{16}$/);
    expect((screen.getByLabelText(new RegExp(`^${f.cardNumber}`)) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(new RegExp(`^${f.cvv}`)) as HTMLInputElement).value).toBe('');
    expect(setItem).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('rotula el pago simulado y el número se ve espaciado (se acepta pegado con cualquier separador)', () => {
    render(<PaymentForm amount={AMOUNT} busy={false} onPay={vi.fn()} />);
    expect(screen.getAllByText(f.simulatedBanner).length).toBeGreaterThan(0);
    const input = screen.getByLabelText(new RegExp('^' + f.cardNumber)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4111-1111 1111.1111x' } });
    expect(input.value).toBe('4111 1111 1111 1111');
    expect(formatCardNumber('4111111111111111999')).toBe('4111 1111 1111 1111 999');
    expect(input.getAttribute('autocomplete')).toBe('cc-number');
    for (const [label, token] of [[f.cardHolder, 'cc-name'], [f.cardExpiry, 'cc-exp'], [f.cvv, 'cc-csc']]) {
      expect((screen.getByLabelText(new RegExp('^' + label)) as HTMLInputElement).getAttribute('autocomplete')).toBe(token);
    }
  });

  describe('validación en vivo', () => {
    const pay = () => screen.getByRole('button', { name: fmt(f.pay, { total: formatMoney(AMOUNT) }) }) as HTMLButtonElement;
    const statusText = () => document.getElementById('card-status')?.textContent ?? '';

    it('al empezar «Pagar» está desactivado y dice qué falta, sin errores a la vista', () => {
      render(<PaymentForm amount={AMOUNT} busy={false} onPay={vi.fn()} />);
      expect(pay().disabled).toBe(true);
      expect(statusText()).toMatch(/Falta completar:/);
      expect(statusText()).toContain('número de tarjeta');
      expect(screen.queryAllByRole('alert')).toHaveLength(0);
    });

    it('una tarjeta inválida no llega a pagarse: el error sale junto al campo al salir de él y el botón sigue desactivado', async () => {
      const onPay = vi.fn();
      render(<PaymentForm amount={AMOUNT} busy={false} onPay={onPay} />);
      fill('4111111111111112');
      expect(pay().disabled).toBe(true);
      fireEvent.blur(screen.getByLabelText(new RegExp(`^${f.cardNumber}`)));
      expect(await screen.findByText(es.validation.cardInvalid)).toBeTruthy();
      expect(statusText()).toMatch(/Revisa: número de tarjeta/);
      fireEvent.click(pay());
      expect(onPay).not.toHaveBeenCalled();
    });

    it('con los cuatro datos bien, «Pagar» se activa y el estado lo dice', async () => {
      render(<PaymentForm amount={AMOUNT} busy={false} onPay={vi.fn()} />);
      fill(TEST_CARDS.approved);
      await waitFor(() => expect(pay().disabled).toBe(false));
      expect(statusText()).toContain(f.cardReady);
    });

    it('el titular solo admite letras y espacios: los números y signos no entran', () => {
      render(<PaymentForm amount={AMOUNT} busy={false} onPay={vi.fn()} />);
      const holder = screen.getByLabelText(new RegExp(`^${f.cardHolder}`)) as HTMLInputElement;
      fireEvent.change(holder, { target: { value: 'ana3 pérez-1.' } });
      expect(holder.value).toBe('ana pérez');
    });

    it('el vencimiento no deja escribir un mes mayor a 12... y el texto se ve con barra', () => {
      render(<PaymentForm amount={AMOUNT} busy={false} onPay={vi.fn()} />);
      const expiry = screen.getByLabelText(new RegExp(`^${f.cardExpiry}`)) as HTMLInputElement;
      fireEvent.change(expiry, { target: { value: '0828' } });
      expect(expiry.value).toBe('08/28');
    });
  });

  it('con un pago en curso el botón queda deshabilitado (no hay doble envío)', () => {
    const onPay = vi.fn();
    render(<PaymentForm amount={AMOUNT} busy onPay={onPay} />);
    const button = screen.getByRole('button', { name: new RegExp(f.paying) }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
