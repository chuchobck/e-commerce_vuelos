import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'idle'; data: undefined; error: undefined }
  | { status: 'loading'; data: T | undefined; error: undefined }
  | { status: 'success'; data: T; error: undefined }
  | { status: 'error'; data: undefined; error: unknown };

/**
 * Ejecuta una función asíncrona y expone su estado (cargando, éxito, error).
 * Ignora respuestas de llamadas antiguas para evitar condiciones de carrera.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], options: { immediate?: boolean } = {}) {
  const { immediate = true } = options;
  const [state, setState] = useState<AsyncState<T>>(
    immediate
      ? { status: 'loading', data: undefined, error: undefined }
      : { status: 'idle', data: undefined, error: undefined },
  );
  const callId = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const execute = useCallback(async () => {
    const id = ++callId.current;
    setState((prev) => ({ status: 'loading', data: prev.data, error: undefined }) as AsyncState<T>);
    try {
      const data = await run();
      if (id === callId.current) setState({ status: 'success', data, error: undefined });
      return data;
    } catch (error) {
      if (id === callId.current) setState({ status: 'error', data: undefined, error });
      return undefined;
    }
  }, [run]);

  useEffect(() => {
    if (immediate) void execute();
    // Al desmontar o cambiar las dependencias se invalida la respuesta pendiente.
    const calls = callId;
    return () => {
      calls.current++;
    };
  }, [execute, immediate]);

  return { ...state, execute, setState };
}
