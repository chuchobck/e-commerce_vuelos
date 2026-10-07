/**
 * Peticiones lentas en curso. Si una tarda más de 3 s probablemente el servidor gratuito de Render
 * está despertando: la interfaz lo explica (sin bloquear) en vez de parecer colgada.
 */
type Listener = (waking: boolean) => void;

let slow = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(slow > 0);
}

export const serverActivity = {
  isWaking: () => slow > 0,
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Marca una petición como lenta; devuelve la función que la desmarca (idempotente). */
  markSlow(): () => void {
    slow++;
    emit();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      slow--;
      emit();
    };
  },
};
