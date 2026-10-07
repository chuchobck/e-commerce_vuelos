// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { es } from '@/shared/i18n';
import { Timer } from './timer';

const T0 = new Date('2026-10-07T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const advance = (s: number) => act(() => void vi.advanceTimersByTime(s * 1000));
const polite = () => document.querySelector('[aria-live="polite"]')!;

describe('temporizador del hold', () => {
  it('cuenta con el momento que se le da (reloj local), sin anunciar cada segundo', () => {
    render(<Timer deadline={T0 + 15 * 60_000} />);
    expect(screen.getByRole('timer').textContent).toBe('15:00');
    advance(10);
    expect(screen.getByRole('timer').textContent).toBe('14:50');
    expect(polite().textContent).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a los 5 minutos avisa de forma cortés (aria-live="polite") y visible, una sola vez', () => {
    render(<Timer deadline={T0 + 6 * 60_000} />);
    advance(60);
    expect(polite().textContent).toBe(es.timer.headsUp);
    expect(polite().className).not.toContain('sr-only');
    expect(screen.queryByRole('alert')).toBeNull();
    advance(30);
    expect(polite().textContent).toBe(es.timer.headsUp);
  });

  it('a los 2 minutos aparece el aviso asertivo (role="alert") con "Necesito más tiempo"', () => {
    const onExtend = vi.fn();
    render(<Timer deadline={T0 + 3 * 60_000} onExtend={onExtend} />);
    expect(screen.queryByRole('alert')).toBeNull();
    advance(60);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(es.timer.warningTitle);
    expect(screen.getByRole('button', { name: es.timer.extend })).toBeTruthy();
    // El aviso de 5 minutos ya no es necesario.
    expect(polite().textContent).toBe('');
  });

  it('al llegar a cero lo dice y avisa una sola vez', () => {
    const onExpire = vi.fn();
    render(<Timer deadline={T0 + 5_000} onExpire={onExpire} />);
    advance(6);
    expect(screen.getByRole('timer').textContent).toBe(es.timer.expired);
    advance(5);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('con otro momento (más tiempo) vuelve a empezar y vuelve a avisar', () => {
    const { rerender } = render(<Timer deadline={T0 + 4 * 60_000} />);
    expect(polite().textContent).toBe(es.timer.headsUp);
    rerender(<Timer deadline={T0 + 15 * 60_000} />);
    expect(polite().textContent).toBe('');
    expect(screen.getByRole('timer').textContent).toBe('15:00');
  });
});
