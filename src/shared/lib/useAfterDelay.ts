import { useEffect, useState } from 'react';

/** `true` cuando `active` lleva `ms` milisegundos seguidos en verdadero (p. ej. «tarda más de lo normal»). */
export function useAfterDelay(active: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, ms]);
  return active && elapsed;
}
