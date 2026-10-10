import { useEffect, useState } from 'react';

const IDLE_FALLBACK_MS = 1500;

/**
 * Dice una sola vez si un elemento entró en pantalla (con `rootMargin` de adelanto, para que lo que está por verse ya
 * esté cargando). Sirve para no pedir a la red lo que nadie ha visto. Sin IntersectionObserver (navegadores muy viejos)
 * se da por visto cuando el navegador queda libre, para no dejar la sección vacía.
 */
export function useInView<T extends Element>(rootMargin = '300px'): { ref: (node: T | null) => void; inView: boolean } {
  const [node, setNode] = useState<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView || !node) return;
    if (typeof IntersectionObserver === 'undefined') {
      const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(() => setInView(true), { timeout: IDLE_FALLBACK_MS }) : undefined;
      const timer = idle === undefined ? setTimeout(() => setInView(true), IDLE_FALLBACK_MS) : undefined;
      return () => {
        if (idle !== undefined) cancelIdleCallback(idle);
        clearTimeout(timer);
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true);
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, inView, rootMargin]);

  return { ref: setNode, inView };
}
