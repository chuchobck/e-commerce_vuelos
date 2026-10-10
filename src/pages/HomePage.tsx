import { Armchair, Plane, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routes, SEARCH_ANCHOR_ID } from '@/app/routes';
import { cityLabel, Panorama, REGION_BG, REGIONS, RegionArt } from '@/features/home';
import { Offers } from '@/features/offers';
import { SearchForm } from '@/features/search';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { Card, FaqList } from '@/shared/ui';
import { offerHref } from './offerHref';

const h = es.home;

const STEPS = [
  { icon: Search, title: h.step1Title, text: h.step1Text },
  { icon: Armchair, title: h.step2Title, text: h.step2Text },
  { icon: Plane, title: h.step3Title, text: h.step3Text },
];

const FAQS = es.help.faqs.filter((f) => (es.help.homeFaqIds as readonly string[]).includes(f.id));

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

      {/* Ofertas: tarifas más bajas reales de las rutas populares; carga cuando la sección se acerca a la pantalla. */}
      <Offers hrefFor={offerHref} searchHref={routes.search()} />

      {/* Destinos de Ecuador: cada ciudad deja el destino puesto en el buscador. */}
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
                        const city = cityLabel(code);
                        return (
                          <li key={code}>
                            <Link
                              to={routes.search(`destino=${code}`)}
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

      {/* Cómo funciona */}
      <section aria-labelledby="pasos-title" className="bg-surface">
        <div className="container-page flex flex-col gap-8 py-16">
          <h2 id="pasos-title" className="text-center text-3xl md:text-4xl">
            {h.stepsTitle}
          </h2>
          <ol className="grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-xl">
                    <span className="text-muted">{fmt(h.stepLabel, { n: i + 1 })} · </span>
                    {title}
                  </h3>
                  <p className="text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Ayuda breve: las mismas respuestas de la página de ayuda (una sola fuente). */}
      <section aria-labelledby="ayuda-title" className="container-page flex max-w-[48rem] flex-col gap-8 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 id="ayuda-title" className="text-3xl md:text-4xl">
            {es.help.homeFaqTitle}
          </h2>
          <p className="text-lg text-muted">{es.help.homeFaqLead}</p>
        </div>
        <FaqList items={FAQS} />
        <p className="text-center">
          <Link to={routes.help('preguntas')} className="inline-flex min-h-12 items-center font-bold">
            {es.help.homeFaqAll}
          </Link>
        </p>
      </section>
    </>
  );
}
