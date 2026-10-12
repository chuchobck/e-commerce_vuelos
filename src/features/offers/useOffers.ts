import { useCallback, useEffect, useState } from 'react';
import { flightsApi, mockScenario } from '@/shared/api';
import { loadOffers, type LoadOffersDeps, type LoadOffersReport } from './loadOffers';
import { offersCache } from './offersCache';

export type OffersState = { status: 'loading' } | { status: 'done'; report: LoadOffersReport };

const DEFAULT_DEPS: LoadOffersDeps = {
  search: (params, options) => flightsApi.search(params, options),
  cache: offersCache,
  // Con el mock, cada escenario de la URL responde distinto: no se mezclan en la caché.
  scope: () => (mockScenario() ? `${mockScenario()}:` : ''),
};

/**
 * Carga las ofertas cuando `enabled` pasa a verdadero (la sección entró en pantalla). Sale de la página = se cancela lo que
 * esté en vuelo. La carga arranca en un `setTimeout(0)` que la limpieza anula: el doble montaje de StrictMode (y un cambio de
 * ruta inmediato) no llega a enviar ninguna búsqueda. `reload` repite la carga; lo que ya está en caché no se vuelve a pedir.
 */
export function useOffers(enabled: boolean, deps: LoadOffersDeps = DEFAULT_DEPS): { state: OffersState; reload: () => void } {
  const [state, setState] = useState<OffersState>({ status: 'loading' });
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void loadOffers(deps, { signal: controller.signal }).then((report) => {
        if (!controller.signal.aborted) setState({ status: 'done', report });
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, round, deps]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setRound((n) => n + 1);
  }, []);

  return { state, reload };
}
