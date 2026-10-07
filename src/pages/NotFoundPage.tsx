import { CircleHelp, Compass, Search, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { SEARCH_ANCHOR_ID } from '@/app/layout/RootLayout';
import { es } from '@/shared/i18n';

const LINKS = [
  { to: `/#${SEARCH_ANCHOR_ID}`, label: es.nav.search, icon: Search },
  { to: '/mis-reservas', label: es.nav.bookings, icon: Ticket },
  { to: '/ayuda', label: es.nav.help, icon: CircleHelp },
];

/** 404 amable: explica qué pasó y ofrece caminos claros. */
export function NotFoundPage() {
  return (
    <Page title={es.notFound.pageTitle} heading={es.notFound.heading} width="narrow">
      <div className="flex flex-col items-center gap-6 text-center">
        <span aria-hidden="true" className="flex size-24 items-center justify-center rounded-full bg-primary-tint text-primary">
          <Compass className="size-12" />
        </span>
        <p className="text-lg">{es.notFound.text}</p>
        <ul className="grid w-full gap-4 sm:grid-cols-3">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex min-h-12 flex-col items-center gap-2 rounded border-2 border-border bg-surface p-6 font-bold no-underline hover:border-primary"
              >
                <Icon aria-hidden="true" className="size-8" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}
