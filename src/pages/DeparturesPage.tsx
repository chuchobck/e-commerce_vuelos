import { Page } from '@/app/layout/Page';
import { DeparturesBoard } from '@/features/departures';
import { es } from '@/shared/i18n';

/** Tablero público de salidas (/salidas): sin sesión, sin reservas y sin datos de pasajeros. */
export function DeparturesPage() {
  const t = es.departures;
  return (
    <Page title={t.pageTitle} description={t.metaDescription} heading={t.heading} lead={t.lead}>
      <DeparturesBoard />
    </Page>
  );
}
