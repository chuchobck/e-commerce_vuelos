import { useCallback, useEffect, useRef, useState } from 'react';

/** Sin tocar nada durante este tiempo aparece el aviso «¿Sigues ahí?». */
export const IDLE_MS = 60_000;
/** Cuenta regresiva del aviso; al llegar a cero se borra todo. */
export const IDLE_WARNING_SECONDS = 15;

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const;

/**
 * Inactividad del kiosko. Con `active`, si pasan `IDLE_MS` sin interacción muestra el aviso (`secondsLeft` baja de 15 a 0) y al
 * llegar a cero llama a `onTimeout`. Cualquier interacción, también durante el aviso, lo cancela y empieza de nuevo.
 */
export function useIdleReset(active: boolean, onTimeout: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const tick = useRef<ReturnType<typeof setInterval>>();

  const clear = useCallback(() => {
    clearTimeout(idleTimer.current);
    clearInterval(tick.current);
  }, []);

  const restart = useCallback(() => {
    clear();
    setSecondsLeft(null);
    idleTimer.current = setTimeout(() => {
      let left = IDLE_WARNING_SECONDS;
      setSecondsLeft(left);
      tick.current = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          clear();
          setSecondsLeft(null);
          timeoutRef.current();
        } else {
          setSecondsLeft(left);
        }
      }, 1000);
    }, IDLE_MS);
  }, [clear]);

  useEffect(() => {
    if (!active) {
      clear();
      setSecondsLeft(null);
      return;
    }
    restart();
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, restart, { passive: true });
    return () => {
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, restart);
      clear();
    };
  }, [active, restart, clear]);

  return { secondsLeft, dismiss: restart };
}
