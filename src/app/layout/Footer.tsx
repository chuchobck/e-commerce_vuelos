import { Accessibility } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import { es, fmt } from '@/shared/i18n';

const COLUMNS = [
  {
    title: es.footer.helpTitle,
    links: [
      { to: routes.help(), label: es.footer.helpCenter },
      { to: routes.help('preguntas'), label: es.footer.faq },
      { to: routes.help('equipaje'), label: es.footer.baggage },
    ],
  },
  {
    title: es.footer.legalTitle,
    links: [
      { to: routes.help('terminos'), label: es.footer.terms },
      { to: routes.help('privacidad'), label: es.footer.privacy },
      { to: routes.help('accesibilidad'), label: es.footer.accessibility },
    ],
  },
];

/** Pie simétrico de tres columnas iguales (Ayuda · Legal · Contacto). */
export function Footer() {
  return (
    <footer className="site-footer mt-auto text-footer-foreground">
      {/* Silueta de los Andes: marca el final de la página sin depender solo del color. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 80"
        preserveAspectRatio="none"
        className="block h-12 w-full fill-footer md:h-20"
      >
        <path d="M0 80V62l90-18 70 12 90-26 70 18 80-26 70 22 70-8 80-28 40 14 40-8 60 26 80-14 80 24 80-32 60 16 60-6 80 24 80-14 80 18 80-10v34z" />
      </svg>
      <div className="bg-footer">
      <div className="container-page flex flex-col gap-8 py-12">
        <nav aria-label={es.a11y.footerNav}>
          <div className="grid gap-8 text-center sm:grid-cols-3">
            {COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col items-center gap-2">
                <h2 className="text-lg text-footer-foreground">{col.title}</h2>
                <ul className="flex flex-col items-center">
                  {col.links.map((l) => (
                    <li key={l.to}>
                      <Link to={l.to} className="inline-flex min-h-12 items-center text-footer-link">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex flex-col items-center gap-2">
              <h2 className="text-lg text-footer-foreground">{es.footer.contactTitle}</h2>
              <ul className="flex flex-col items-center">
                <li>
                  <a href={es.footer.phoneHref} className="inline-flex min-h-12 items-center text-footer-link">
                    <span className="sr-only">{es.footer.phoneLabel}: </span>
                    {es.footer.phone}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${es.footer.email}`} className="inline-flex min-h-12 items-center text-footer-link">
                    <span className="sr-only">{es.footer.emailLabel}: </span>
                    {es.footer.email}
                  </a>
                </li>
                <li className="flex min-h-12 items-center text-sm text-footer-muted">{es.footer.hours}</li>
              </ul>
            </div>
          </div>
        </nav>

        <div className="mx-auto flex max-w-prose flex-col items-center gap-2 border-t-2 border-footer-border pt-8 text-center">
          <Accessibility aria-hidden="true" className="size-8 text-footer-link" />
          <p className="text-sm">
            {es.footer.a11yStatement}{' '}
            <Link to={routes.help('accesibilidad')} className="text-footer-link">
              {es.footer.accessibility}
            </Link>
          </p>
          <p className="text-sm text-footer-muted">{fmt(es.footer.rights, { year: new Date().getFullYear() })}</p>
        </div>
      </div>
      </div>
    </footer>
  );
}
