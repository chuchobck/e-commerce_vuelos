import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cityOf, findAirport } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatDuration, formatMoney, formatShortDate, formatTime } from '@/shared/lib/format';
import type { Offer } from './cheapestOffer';

const t = es.offers;

/** Solo se menciona cuántos asientos quedan cuando la API informa pocos: con 40 libres no es un dato útil. */
const SEATS_NOTICE_MAX = 9;

/**
 * Una oferta: ruta, fecha, aerolínea y vuelo, horario y «Desde $X». Todo sale de la respuesta de la búsqueda.
 * El enlace «Ver vuelo» cubre toda la tarjeta (se puede tocar en cualquier parte) y es el único elemento enfocable.
 */
/** `headingLevel`: h3 bajo el h2 «Ofertas» del inicio; h2 en la página /ofertas, donde el h1 es el título (sin saltar niveles). */
export function OfferCard({ offer, href, headingLevel = 'h3' }: { offer: Offer; href: string; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel;
  const origin = cityOf(offer.origin);
  const destination = cityOf(offer.destination);
  const region = findAirport(offer.destination)?.region;
  const price = formatMoney(offer.price);
  const duration = formatDuration(offer.durationMinutes);
  const stops = offer.stops === 0 ? fmt(t.direct, { duration }) : fmt(offer.stops === 1 ? t.stopsOne : t.stopsMany, { count: offer.stops, duration });

  return (
    <article className="relative flex h-full flex-col gap-4 rounded border-2 border-border bg-surface p-6 shadow-card transition-colors duration-150 focus-within:border-primary hover:border-primary motion-reduce:transition-none">
      <p className="text-sm font-bold uppercase tracking-wide text-muted">{region ? es.home.worlds[region].name : ' '}</p>
      <Heading aria-label={fmt(t.routeLabel, { origin, destination })} className="flex flex-wrap items-center gap-x-2 font-display text-2xl font-semibold">
        {origin}
        <ArrowRight aria-hidden="true" className="size-6 shrink-0 text-primary" />
        {destination}
      </Heading>
      <div className="flex flex-col gap-2 text-muted">
        <p className="font-bold text-foreground">{formatShortDate(offer.date)}</p>
        <p>{fmt(t.flights, { airline: offer.airline.name, flights: offer.flightNumbers.join(' + ') })}</p>
        <p>{fmt(t.schedule, { departure: formatTime(offer.departureTime), arrival: formatTime(offer.arrivalTime) })}</p>
        <p>{stops}</p>
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <p className="flex flex-col">
          <span className="text-3xl font-extrabold tabular-nums text-foreground">{fmt(t.from, { price })}</span>
          <span className="text-sm text-muted">{t.priceNote}</span>
        </p>
        {offer.seatsLeft > 0 && offer.seatsLeft <= SEATS_NOTICE_MAX ? (
          <p className="text-sm font-bold text-foreground">{offer.seatsLeft === 1 ? t.seatsLeftOne : fmt(t.seatsLeft, { count: offer.seatsLeft })}</p>
        ) : null}
        <Link
          to={href}
          aria-label={fmt(t.ctaLabel, { origin, destination, date: formatShortDate(offer.date), price })}
          className="inline-flex min-h-12 items-center gap-2 font-bold after:absolute after:inset-0 after:content-['']"
        >
          {t.cta}
          <ArrowRight aria-hidden="true" className="size-6" />
        </Link>
      </div>
    </article>
  );
}
