import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { addDays, nextFriday } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import { faresForCabin, flightsApi } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { lastFlightDate, parseIsoDate, toIsoDate, today } from '@/shared/lib/dates';
import { formatDuration, formatMoney, formatShortDate } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { LoadingState, Skeleton } from '@/shared/ui';
import { escapeFromOffers, escapesCache, type Escape } from './escapePrice';
import { cityLabel, ESCAPES, REGION_BG, regionOf, type EscapeOrigin } from './regions';

const h = es.home;
const ORIGINS = Object.keys(ESCAPES) as EscapeOrigin[];

/** Próximo fin de semana (viernes a domingo), siempre a futuro. */
function weekend() {
  const friday = nextFriday(today());
  return { friday: toIsoDate(friday), sunday: toIsoDate(addDays(friday, 2)) };
}

/**
 * Una búsqueda real por destino (4 por ciudad de salida, con la API limitada a 20 por minuto),
 * guardada 10 minutos. Un destino que falla o no tiene vuelos simplemente no se muestra:
 * nunca se inventa un precio.
 */
async function loadEscapes(origin: EscapeOrigin): Promise<Escape[]> {
  const { friday, sunday } = weekend();
  // Fuera de la ventana de salidas de la API no hay nada que mostrar.
  if ((parseIsoDate(sunday) ?? today()) > lastFlightDate()) return [];
  const results = await Promise.all(
    ESCAPES[origin].map((code) =>
      escapesCache
        .getOrLoad(`${origin}-${code}-${friday}`, async () => {
          const r = await flightsApi.search({
            origin,
            destination: code,
            departDate: friday,
            returnDate: sunday,
            passengers: { adults: 1, children: 0, infants: 0 },
            cabin: 'ECONOMY',
          });
          return escapeFromOffers(code, r.offers, (it) => faresForCabin(it, 'ECONOMY'));
        })
        .catch(() => null),
    ),
  );
  return results.filter((e): e is Escape => e !== null && e.price !== null);
}

function resultsHref(origin: string, destination: string) {
  const { friday, sunday } = weekend();
  const q = new URLSearchParams({
    origen: origin,
    destino: destination,
    ida: friday,
    vuelta: sunday,
    adultos: '1',
    ninos: '0',
    infantes: '0',
    cabina: 'ECONOMY',
  });
  return routes.results(q.toString());
}

/** "Escápate este fin de semana": pensada para quien ya vive en Ecuador. */
export function Escapes() {
  const [origin, setOrigin] = useState<EscapeOrigin>('UIO');
  const escapes = useAsync(() => loadEscapes(origin), [origin]);
  const { friday, sunday } = weekend();
  // Si ninguna escapada tiene precio real (error, límite o sin vuelos), la sección no se muestra.
  if (escapes.status === 'error' || (escapes.status === 'success' && escapes.data.length === 0)) return null;

  return (
    <section aria-labelledby="escapes-title" className="bg-surface">
      <div className="container-page flex flex-col gap-8 py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 id="escapes-title" className="text-3xl md:text-4xl">
            {h.escapesTitle}
          </h2>
          <p className="text-lg text-muted">
            {fmt(h.escapesLead, { friday: formatShortDate(friday), sunday: formatShortDate(sunday) })}
          </p>
          <RadioGroupPrimitive.Root
            aria-label={h.escapesFrom}
            value={origin}
            onValueChange={(v) => setOrigin(v as EscapeOrigin)}
            orientation="horizontal"
            className="flex flex-wrap items-center justify-center gap-2"
          >
            <span aria-hidden="true" className="mr-2 font-bold">
              {h.escapesFrom}
            </span>
            {ORIGINS.map((code) => (
              <RadioGroupPrimitive.Item
                key={code}
                value={code}
                className={cn(
                  'min-h-12 rounded-full border-2 border-input px-6 font-bold text-foreground transition-colors duration-150 motion-reduce:transition-none',
                  'hover:border-foreground data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
                )}
              >
                {cityLabel(code)}
              </RadioGroupPrimitive.Item>
            ))}
          </RadioGroupPrimitive.Root>
        </div>

        {escapes.status === 'success' ? null : (
          <LoadingState label={h.escapesLoading} className="items-center" />
        )}

        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-busy={escapes.status === 'loading'}>
          {escapes.status === 'success'
            ? escapes.data.map((e) => {
                const region = regionOf(e.code);
                return (
                  <li key={e.code}>
                    <article className="flex h-full flex-col overflow-hidden rounded border-2 border-border bg-background">
                      <span aria-hidden="true" className={cn('h-2', region ? REGION_BG[region] : 'bg-primary')} />
                      <div className="flex flex-1 flex-col gap-2 p-6">
                        {region ? (
                          <p className="text-sm font-bold uppercase tracking-wide text-muted">{h.worlds[region].name}</p>
                        ) : null}
                        <h3 className="font-display text-2xl font-semibold">{cityLabel(e.code)}</h3>
                        {e.durationMinutes !== null ? (
                          <p className="text-sm text-muted">
                            {fmt(e.direct ? h.escapesDirect : h.escapesStops, {
                              duration: formatDuration(e.durationMinutes),
                            })}
                          </p>
                        ) : null}
                        {e.price ? (
                          <p className="mt-auto flex flex-col pt-4">
                            <span className="text-2xl font-extrabold tabular-nums text-foreground">
                              {fmt(h.escapesPrice, { price: formatMoney(e.price) })}
                            </span>
                            <span className="text-sm text-muted">{h.escapesPriceNote}</span>
                          </p>
                        ) : null}
                        <Link to={resultsHref(origin, e.code)} className="mt-2 inline-flex min-h-12 items-center gap-2 font-bold">
                          {fmt(h.escapesCta, { city: cityLabel(e.code) })}
                          <ArrowRight aria-hidden="true" className="size-6" />
                        </Link>
                      </div>
                    </article>
                  </li>
                );
              })
            : ESCAPES[origin].map((code) => (
                <li key={code}>
                  <Skeleton className="h-64 w-full" />
                </li>
              ))}
        </ul>
      </div>
    </section>
  );
}
