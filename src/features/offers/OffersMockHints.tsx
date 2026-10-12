import { useLocation } from 'react-router-dom';
import { MOCK_SCENARIOS, mockScenario, SCENARIO_PARAM } from '@/shared/api';
import { es } from '@/shared/i18n';
import { MockOnly } from '@/shared/ui';

const t = es.offers;

/**
 * Pistas para ver cada estado de las ofertas con la API simulada. Son enlaces normales (recargan la página): cada carga
 * empieza de cero y el escenario de la URL decide qué responde la búsqueda. Con la API real no se muestran.
 */
export function OffersMockHints() {
  const { pathname } = useLocation();
  const active = mockScenario();
  const item = (label: string, scenario: string | null) => (
    <li key={label}>
      <a
        href={scenario ? `${pathname}?${SCENARIO_PARAM}=${scenario}` : pathname}
        aria-current={scenario === active ? 'true' : undefined}
        className="inline-flex min-h-12 items-center underline underline-offset-4 aria-[current=true]:font-bold"
      >
        {label}
      </a>
    </li>
  );
  return (
    <MockOnly>
      <aside aria-labelledby="ofertas-mock" className="flex flex-col gap-2 rounded border-2 border-dashed border-input p-4 text-sm">
        <p id="ofertas-mock" className="font-bold">
          {t.mockTitle}
        </p>
        <p className="text-muted">{t.mockText}</p>
        <ul className="flex flex-wrap gap-x-6">
          {item(t.scenarioNormal, null)}
          {MOCK_SCENARIOS.map((scenario) => item(t.scenarios[scenario], scenario))}
        </ul>
      </aside>
    </MockOnly>
  );
}
