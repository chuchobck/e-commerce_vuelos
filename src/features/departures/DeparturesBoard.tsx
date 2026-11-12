import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { AIRPORTS, findAirport } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate } from '@/shared/lib/format';
import { Alert, Button, EmptyState, Field, Input, LoadingState, MockOnly, Select } from '@/shared/ui';
import { DeparturesTable } from './DeparturesTable';
import { useDepartures } from './useDepartures';

const t = es.departures;
const DEFAULT_AIRPORT = 'UIO';

/** Fecha de hoy (yyyy-MM-dd) en la zona del aeropuerto, no en la del navegador. */
export function todayAt(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Pantalla pública de salidas: elige aeropuerto y fecha (hoy por defecto) y muestra el tablero, que se actualiza solo. */
export function DeparturesBoard() {
  const [code, setCode] = useState(DEFAULT_AIRPORT);
  const [date, setDate] = useState(() => todayAt(findAirport(DEFAULT_AIRPORT)?.timeZone ?? 'America/Guayaquil'));
  const board = useDepartures(code, date);
  const page = board.page;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.airport} required>
          <Select value={code} onChange={(e) => setCode(e.target.value)} options={AIRPORTS.map((a) => ({ value: a.code, label: `${a.city} (${a.code})` }))} />
        </Field>
        <Field label={t.date} required>
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
      </div>

      {board.updatedAt ? (
        <p role="status" className="flex items-center gap-2 text-base text-muted">
          <RefreshCw aria-hidden="true" className={board.refreshing ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'} />
          {fmt(t.updatedAt, { time: format(board.updatedAt, 'HH:mm') })}
        </p>
      ) : null}

      {board.stale ? (
        <Alert variant="warning" live="assertive" action={<Button variant="secondary" onClick={board.retry}>{t.retry}</Button>}>
          <p>{t.updateFailed}</p>
        </Alert>
      ) : null}

      {board.status === 'loading' ? <LoadingState label={t.loading} skeletons={4} /> : null}
      {board.status === 'error' ? (
        <Alert variant="error" live="assertive" action={<Button variant="secondary" onClick={board.retry}>{t.retry}</Button>}>
          <p>{t.loadFailed}</p>
        </Alert>
      ) : null}

      {page && page.departures.length === 0 ? <EmptyState title={t.empty} text="" /> : null}
      {page && page.departures.length > 0 ? (
        <DeparturesTable departures={page.departures} caption={fmt(t.caption, { airport: `${page.airport.city} (${page.airport.code})`, date: formatLongDate(page.date) })} />
      ) : null}

      {board.moreFailed ? (
        <Alert variant="error" live="assertive">
          <p>{t.loadMoreFailed}</p>
        </Alert>
      ) : null}
      {page?.nextCursor ? (
        <Button variant="secondary" size="lg" className="sm:w-fit" onClick={board.loadMore} loading={board.loadingMore} loadingText={t.loadingMore}>
          {t.loadMore}
        </Button>
      ) : null}
      <MockOnly>
        <p className="text-sm text-muted">{t.mockHint}</p>
      </MockOnly>
    </div>
  );
}
