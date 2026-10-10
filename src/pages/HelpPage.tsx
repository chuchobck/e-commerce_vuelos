import { Accessibility, Mail, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { Page } from '@/app/layout/Page';
import { es, fmt } from '@/shared/i18n';
import { Card, FaqList } from '@/shared/ui';

const h = es.help;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-8 flex-col gap-4">
      <h2 id={`${id}-title`} className="text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function HelpPage() {
  return (
    <Page title={h.pageTitle} heading={h.heading} lead={h.lead} width="narrow">
      <Section id="preguntas" title={h.faqTitle}>
        <FaqList items={h.faqs} />
      </Section>

      <Section id="equipaje" title={h.baggageTitle}>
        <div className="overflow-x-auto rounded border-2 border-border" tabIndex={0} role="region" aria-labelledby="equipaje-title">
          <table className="w-full min-w-[36rem] border-collapse bg-surface text-left">
            <caption className="sr-only">{h.baggageCaption}</caption>
            <thead className="bg-primary-tint">
              <tr>
                {Object.values(h.baggageCols).map((col) => (
                  <th key={col} scope="col" className="p-4">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {h.baggageRows.map((row) => (
                <tr key={row.fare} className="border-t-2 border-border">
                  <th scope="row" className="p-4">
                    {row.fare}
                  </th>
                  <td className="p-4">{row.personal}</td>
                  <td className="p-4">{row.carry}</td>
                  <td className="p-4">{row.checked}</td>
                  <td className="p-4">{row.changes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="contacto" title={h.contactTitle}>
        <p>{h.contactText}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex items-center gap-4 p-4">
            <Phone aria-hidden="true" className="size-6 text-primary" />
            <a href={es.footer.phoneHref} className="inline-flex min-h-12 items-center">
              {fmt(h.contactPhone, { phone: es.footer.phone })}
            </a>
          </Card>
          <Card className="flex items-center gap-4 p-4">
            <Mail aria-hidden="true" className="size-6 text-primary" />
            <a href={`mailto:${es.footer.email}`} className="inline-flex min-h-12 items-center">
              {fmt(h.contactEmail, { email: es.footer.email })}
            </a>
          </Card>
        </div>
        <p className="text-sm text-muted">{es.footer.hours}</p>
      </Section>

      <Section id="accesibilidad" title={h.a11yTitle}>
        <div className="flex gap-4">
          <Accessibility aria-hidden="true" className="size-8 shrink-0 text-primary" />
          <div className="flex flex-col gap-4">
            <p>{h.a11yText}</p>
            <p>{fmt(h.a11yContact, { email: es.footer.email })}</p>
          </div>
        </div>
        <div className="overflow-x-auto rounded border-2 border-border">
          <table className="w-full border-collapse bg-surface text-left">
            <caption className="p-4 text-left font-bold">{h.shortcutsTitle}</caption>
            <thead className="bg-primary-tint">
              <tr>
                <th scope="col" className="p-4">
                  {h.shortcutKeys}
                </th>
                <th scope="col" className="p-4">
                  {h.shortcutAction}
                </th>
              </tr>
            </thead>
            <tbody>
              {h.shortcuts.map((s) => (
                <tr key={s.keys} className="border-t-2 border-border">
                  <td className="p-4">
                    <kbd className="rounded border-2 border-input px-2 font-bold">{s.keys}</kbd>
                  </td>
                  <td className="p-4">{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="terminos" title={h.termsTitle}>
        <p>{h.termsText}</p>
      </Section>

      <Section id="privacidad" title={h.privacyTitle}>
        <p>{fmt(h.privacyText, { email: es.footer.email })}</p>
      </Section>
    </Page>
  );
}
