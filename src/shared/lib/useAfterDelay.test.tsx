// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAfterDelay } from './useAfterDelay';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useAfterDelay', () => {
  it('es falso al empezar y verdadero cuando pasa el tiempo estando activo', () => {
    const { result } = renderHook(() => useAfterDelay(true, 8000));
    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(7999));
    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it('si termina antes, nunca llega a ser verdadero; al volver a empezar, cuenta desde cero', () => {
    const { result, rerender } = renderHook(({ on }) => useAfterDelay(on, 8000), { initialProps: { on: true } });
    act(() => void vi.advanceTimersByTime(5000));
    rerender({ on: false });
    act(() => void vi.advanceTimersByTime(10_000));
    expect(result.current).toBe(false);
    rerender({ on: true });
    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(7999));
    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });
});
