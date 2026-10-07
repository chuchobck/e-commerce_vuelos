import { CreditCard, Ticket, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SEARCH_ANCHOR_ID } from '@/app/layout/RootLayout';
import { Escapes, Panorama, REGION_BG, REGIONS, RegionArt } from '@/features/home';
import { SearchForm } from '@/features/search';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { Card } from '@/shared/ui';

const h = es.home;

const STEPS = [
  { icon: Ticket, title: h.step1Title, text: h.step1Text },
  { icon: UserRound, title: h.step2Title, text: h.step2Text },
  { icon: CreditCard, title: h.step3Title, text: h.step3Text },
];

export function HomePage() {
  usePageTitle(h.pageTitle);

  return (
    <>
      {/* Hero: cielo + Ecuador de oeste a este; el buscador flota sobre el paisaje. */}
      <section aria-labelledby="hero-title" className="hero-sky">
        <div className="container-page flex flex-col items-center gap-4 pt-12 text-center md:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-surface/70 px-4 py-2 text-sm font-bold text-primary">
            <img src="/brand/favicon.png" alt="" width={24} height={24} className="size-6" />
            {h.heroEyebrow}
          </p>
          <h1 id="hero-title" className="text-4xl leading-tight md:text-[3.75rem] md:leading-[1.05]">
            <span className="block">{h.heroTitleA}</span>
            <em className="block text-primary">{h.heroTitleB}</em>
          </h1>
          <p className="max-w-prose text-lg text-muted">{h.heroLead}</p>
        </div>
        <Panorama className="mt-4 h-[220px] w-full md:mt-6 md:h-[320px]" />
      </section>

      <div className="container-page relative z-10 -mt-16 md:-mt-24">
        {/* El ancla de Alt + B es la tarjeta completa: al enfocarla el anillo se ve en todo el buscador. */}
        <Card
          id={SEARCH_ANCHOR_ID}
          tabIndex={-1}
          aria-labelledby="buscador-title"
          role="region"
          className="w-full p-4 shadow-raised md:p-6 xl:p-4"
        >
          <h2 id="buscador-title" className="sr-only">
            {es.search.title}
          </h2>
          <SearchForm />
        </Card>
      </div>

      {/* Los cuatro mundos */}
      <section aria-labelledby="mundos-title" className="container-page flex flex-col gap-8 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 id="mundos-title" className="text-3xl md:text-4xl">
            {h.worldsTitle}
          </h2>
          <p className="text-lg text-muted">{h.worldsLead}</p>
        </div>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {REGIONS.map((region) => {
            const world = h.worlds[region.id];
            return (
              <li key={region.id}>
                <article className="flex h-full flex-col overflow-hidden rounded border-2 border-border bg-surface shadow-card">
                  <RegionArt region={region.id} className="aspect-[2/1] w-full" />
                  <span aria-hidden="true" className={cn('h-2', REGION_BG[region.id])} />
                  <div className="flex flex-1 flex-col gap-4 p-6">
                    <h3 className="font-display text-2xl font-semibold">{world.name}</h3>
                    <p className="flex-1 text-muted">{world.hook}</p>
                    <ul aria-label={fmt(h.worldsDestinations, { region: world.name })} className="flex flex-wrap gap-2">
                      {region.airports.map((code) => {
                        const city = h.cities[code];
                        return (
                          <li key={code}>
                            <Link
                              to={`/?destino=${code}#${SEARCH_ANCHOR_ID}`}
                              aria-label={fmt(h.flyTo, { city })}
                              className="inline-flex min-h-12 items-center rounded-full border-2 border-input px-4 text-sm font-bold text-foreground no-underline hover:border-primary hover:bg-primary-tint"
                            >
                              {city.replace(/\s*\(.*\)$/, '')}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      <Escapes />

      {/* Ecuador en cifras */}
      <section aria-labelledby="cifras-title" className="container-page flex flex-col gap-8 py-16">
        <h2 id="cifras-title" className="text-center text-3xl md:text-4xl">
          {h.factsTitle}
        </h2>
        <dl className="grid gap-8 text-center sm:grid-cols-2 lg:grid-cols-4">
          {h.facts.map((f) => (
            <div key={f.value} className="flex flex-col items-center gap-2">
              <dt className="order-2 text-muted">{f.text}</dt>
              <dd className="order-1 font-display text-4xl font-semibold text-primary">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Compra en 3 pasos: franja breve */}
      <section aria-labelledby="pasos-title" className="border-t-2 border-border">
        <div className="container-page flex flex-col gap-8 py-12">
          <h2 id="pasos-title" className="text-center text-2xl md:text-3xl">
            {h.stepsTitle}
          </h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex items-start gap-4">
                <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg">
                    <span className="text-muted">{fmt(h.stepLabel, { n: i + 1 })} · </span>
                    {title}
                  </h3>
                  <p className="text-sm text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
