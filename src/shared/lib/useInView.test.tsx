// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInView } from './useInView';

function Probe() {
  const { ref, inView } = useInView<HTMLDivElement>('100px');
  return <div ref={ref}>{inView ? 'visto' : 'oculto'}</div>;
}

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let callback: Callback = () => undefined;
const observe = vi.fn();
const disconnect = vi.fn();
let options: IntersectionObserverInit | undefined;

beforeEach(() => {
  observe.mockReset();
  disconnect.mockReset();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: Callback, init?: IntersectionObserverInit) {
        callback = cb;
        options = init;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useInView', () => {
  it('empieza sin verse, observa el elemento con el margen pedido y avisa al entrar en pantalla', () => {
    const { container } = render(<Probe />);
    expect(container.textContent).toBe('oculto');
    expect(observe).toHaveBeenCalledTimes(1);
    expect(options).toEqual({ rootMargin: '100px' });
    act(() => callback([{ isIntersecting: false }]));
    expect(container.textContent).toBe('oculto');
    act(() => callback([{ isIntersecting: true }]));
    expect(container.textContent).toBe('visto');
  });

  it('una vez visto deja de observar y no vuelve atrás', () => {
    const { container } = render(<Probe />);
    act(() => callback([{ isIntersecting: true }]));
    expect(disconnect).toHaveBeenCalled();
    act(() => callback([{ isIntersecting: false }]));
    expect(container.textContent).toBe('visto');
  });

  it('sin IntersectionObserver se da por visto cuando el navegador queda libre (la sección no queda vacía)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();
    const { container } = render(<Probe />);
    expect(container.textContent).toBe('oculto');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.textContent).toBe('visto');
  });
});
