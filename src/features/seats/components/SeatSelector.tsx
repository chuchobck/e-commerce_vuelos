import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { isApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { NO_FILTERS, type SeatFilters } from '../model/filters';
import { buildSeatLayout, seatsOfCabin, type SeatLayout } from '../model/layout';
import { applyAlternative, reconcileSegment } from '../model/reconcile';
import { countChosen, nextWithoutSeat, seatablePassengers, seatOf } from '../model/selection';
import { fetchSeatMap, latestSeatMap, subscribeSeatMaps } from '../seatMapStore';
import type { SeatConflict, SeatSegment, SeatSelectorProps } from '../types';
import { PassengerChips } from './PassengerChips';
import { SeatConflictNotice } from './SeatConflictNotice';
import { SegmentPanel, type SeatView } from './SegmentPanel';
import { SegmentTabs, type SegmentTab } from './SegmentTabs';
import { ZOOM_LEVELS } from './ZoomControls';

const t = es.seats;

const cabinLabel = (cabin: string) => t.cabins[cabin] ?? t.cabinFallback;

function segmentLabel(segment: SeatSegment): string {
  const leg = segment.leg === 'outbound' ? t.legOutbound : t.legInbound;
  return segment.legSize > 1 ? fmt(t.legStop, { leg, index: segment.indexInLeg + 1, total: segment.legSize }) : leg;
}

const routeOf = (segment: SeatSegment) => fmt(t.segmentRoute, { origin: segment.origin, destination: segment.destination });

/** Un mismo mapa se interpreta una sola vez aunque lo revisen varias veces. */
const layouts = new WeakMap<object, SeatLayout>();
function layoutOf(map: object & Parameters<typeof buildSeatLayout>[0]): SeatLayout {
  let layout = layouts.get(map);
  if (!layout) {
    layout = buildSeatLayout(map);
    layouts.set(map, layout);
  }
  return layout;
}

/**
 * Selector de asientos por tramo, independiente del checkout. Es controlado: recibe `value` y avisa los
 * cambios con `onChange`. Elegir asiento es opcional: sin tocar nada, `value` queda como llegó y la
 * reserva asigna los asientos automáticamente. Uso y formato en el README (sección "Selector de asientos").
 */
export function SeatSelector({ offerId, segments, passengers, value, onChange, onConflict, serverError, className }: SeatSelectorProps) {
  const panelId = useId();
  const seatable = useMemo(() => seatablePassengers(passengers), [passengers]);
  const [activeSegmentId, setActiveSegmentId] = useState(segments[0]?.id ?? '');
  const [activePassengerId, setActivePassengerId] = useState<string | undefined>(seatable[0]?.id);
  const [filters, setFilters] = useState<SeatFilters>(NO_FILTERS);
  const [zoom, setZoom] = useState<number>(ZOOM_LEVELS[0]);
  const [view, setView] = useState<SeatView>('map');
  const [conflicts, setConflicts] = useState<SeatConflict[]>([]);
  const [status, setStatus] = useState('');
  const [alert, setAlert] = useState('');
  const [focusRequest, setFocusRequest] = useState<{ segmentId: string; seat: string; nonce: number } | undefined>();
  const [storeVersion, setStoreVersion] = useState(0);

  // Referencias para no repetir efectos cuando el anfitrión pasa funciones nuevas en cada render.
  const handlers = useRef({ onChange, onConflict });
  handlers.current = { onChange, onConflict };
  const valueRef = useRef(value);
  valueRef.current = value;

  const segment = segments.find((s) => s.id === activeSegmentId) ?? segments[0];

  /** Anuncia sin repetir el mismo texto dos veces seguidas en silencio (el lector solo lee si cambia). */
  const announce = useCallback((message: string, kind: 'status' | 'alert' = 'status') => {
    const flip = (previous: string) => (previous === message ? `${message}\u200b` : message);
    if (kind === 'alert') {
      setAlert(flip);
      setStatus('');
    } else {
      setStatus(flip);
      setAlert('');
    }
  }, []);

  const commit = useCallback(
    (next: Parameters<typeof onChange>[0], message: string, nextActiveId?: string) => {
      valueRef.current = next;
      handlers.current.onChange(next);
      announce(message);
      if (nextActiveId) setActivePassengerId(nextActiveId);
    },
    [announce],
  );

  // El aviso de cada conflicto es un role="alert" (SeatConflictNotice): no se repite en la línea de estado.
  // Revisa lo elegido contra los últimos mapas conocidos: un asiento ocupado o de otra cabina se quita y
  // se avisa; lo demás se conserva. Es idempotente: una segunda llamada ya no encuentra nada.
  const found = useRef(0);
  const reconcile = useCallback(() => {
    let next = valueRef.current;
    const conflictsFound: SeatConflict[] = [];
    for (const seg of segments) {
      const entry = latestSeatMap(offerId, seg.id);
      if (!entry) continue;
      const result = reconcileSegment(next, seg, layoutOf(entry.map), passengers);
      next = result.value;
      conflictsFound.push(...result.conflicts);
    }
    if (conflictsFound.length === 0) return;
    found.current += conflictsFound.length;
    valueRef.current = next;
    handlers.current.onChange(next);
    setConflicts((previous) => [...previous, ...conflictsFound]);
    const first = conflictsFound[0];
    setActivePassengerId(first.passengerId);
    setActiveSegmentId(first.segmentId);
    conflictsFound.forEach((conflict) => handlers.current.onConflict?.(conflict));
  }, [segments, passengers, offerId]);

  // Cada mapa que llega (primera carga, actualización, vuelta a la pestaña) y cada cambio de `value`
  // se revisan: así también se detecta un asiento inválido que llegó desde fuera.
  useEffect(() => subscribeSeatMaps(() => setStoreVersion((v) => v + 1)), []);
  useEffect(reconcile, [reconcile, value, storeVersion]);

  // Error de la reserva (409 SEAT_TAKEN / 422 SEAT_CABIN_MISMATCH): se actualizan los mapas con asientos
  // elegidos y se revisan. El error no dice cuál asiento falló; si la revisión no encuentra nada,
  // el aviso es general.
  const lastError = useRef<unknown>(undefined);
  useEffect(() => {
    if (!serverError || serverError === lastError.current || !isApiError(serverError)) return;
    if (serverError.code !== 'SEAT_TAKEN' && serverError.code !== 'SEAT_CABIN_MISMATCH') return;
    lastError.current = serverError;
    const kind: SeatConflict['kind'] = serverError.code === 'SEAT_TAKEN' ? 'SEAT_TAKEN' : 'CABIN_MISMATCH';
    const chosen = segments.filter((s) => Object.values(valueRef.current).some((bySegment) => bySegment[s.id]));
    const before = found.current;
    void Promise.allSettled(chosen.map((s) => fetchSeatMap(offerId, s.id, { fresh: true }))).then(() => {
      reconcile();
      if (found.current !== before) return;
      setConflicts((previous) => [...previous, { kind, segmentId: chosen[0]?.id ?? segments[0]?.id ?? '' }]);
    });
  }, [serverError, segments, offerId, reconcile]);

  const tabs: SegmentTab[] = segments.map((s) => {
    const chosen = countChosen(value, passengers, s.id);
    return {
      id: s.id,
      label: segmentLabel(s),
      route: routeOf(s),
      status: chosen > 0 ? fmt(t.segmentChosen, { count: chosen, total: seatable.length }) : t.segmentAutomatic,
    };
  });

  const selectSegment = (id: string) => {
    setActiveSegmentId(id);
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;
    announce(fmt(t.announceSegment, { label: `${segmentLabel(seg)}, ${routeOf(seg)}` }));
    // Si quien elegía ya tiene asiento en este tramo, se pasa al primero que aún no tiene.
    const current = activePassengerId ?? seatable[0]?.id;
    if (!current || seatOf(valueRef.current, current, id)) {
      const next = nextWithoutSeat(passengers, valueRef.current, id);
      if (next) setActivePassengerId(next.id);
    }
  };

  const dismiss = (conflict: SeatConflict) => setConflicts((all) => all.filter((c) => c !== conflict));

  const useAlternative = (conflict: SeatConflict) => {
    const seg = segments.find((s) => s.id === conflict.segmentId);
    const entry = seg ? latestSeatMap(offerId, seg.id) : undefined;
    const seat = conflict.alternative ? entry && layoutOf(entry.map).bySeat.get(conflict.alternative) : undefined;
    dismiss(conflict);
    if (!seg || !seat?.available || !conflict.passengerId || !conflict.alternative) return;
    const name = passengers.find((p) => p.id === conflict.passengerId)?.name ?? '';
    commit(applyAlternative(valueRef.current, conflict), fmt(t.announceChosen, { seat: conflict.alternative, name }));
    setFocusRequest({ segmentId: seg.id, seat: conflict.alternative, nonce: Date.now() });
    setView('map');
  };

  const showCabin = (conflict: SeatConflict) => {
    const seg = segments.find((s) => s.id === conflict.segmentId);
    const entry = seg ? latestSeatMap(offerId, seg.id) : undefined;
    dismiss(conflict);
    if (!seg || !entry) return;
    const first = seatsOfCabin(layoutOf(entry.map), seg.cabin).find((s) => s.available);
    setActiveSegmentId(seg.id);
    setView('map');
    if (first) setFocusRequest({ segmentId: seg.id, seat: first.number, nonce: Date.now() });
  };

  if (!segment) return null;
  const allAuto = Object.keys(value).length === 0;
  const multi = segments.length > 1;

  return (
    <section aria-labelledby={`${panelId}-title`} className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-2">
        <h2 id={`${panelId}-title`} className="flex flex-wrap items-center gap-2 text-2xl">
          {t.title}
          <span className="rounded-full border-2 border-input px-4 py-px text-sm font-bold">{t.optionalTag}</span>
        </h2>
        <p className="text-muted">{t.intro}</p>
        <p className="font-bold">{allAuto ? t.autoAll : t.someAuto}</p>
      </div>

      {conflicts.map((conflict, index) => {
        const seg = segments.find((s) => s.id === conflict.segmentId) ?? segment;
        return (
          <SeatConflictNotice
            key={`${conflict.segmentId}-${conflict.seatNumber ?? 'x'}-${index}`}
            conflict={conflict}
            segmentLabel={`${segmentLabel(seg)}, ${routeOf(seg)}`}
            cabinLabel={cabinLabel(seg.cabin)}
            onUseAlternative={useAlternative}
            onShowCabin={showCabin}
            onDismiss={dismiss}
          />
        );
      })}

      <PassengerChips
        passengers={passengers}
        activeId={activePassengerId ?? seatable[0]?.id}
        seatOf={(id) => seatOf(value, id, segment.id)}
        onSelect={(id) => {
          setActivePassengerId(id);
          const name = passengers.find((p) => p.id === id)?.name ?? '';
          announce(fmt(t.announceActive, { name }));
        }}
      />

      {multi ? <SegmentTabs tabs={tabs} activeId={segment.id} panelId={panelId} onSelect={selectSegment} /> : null}

      <div
        id={panelId}
        role={multi ? 'tabpanel' : undefined}
        aria-labelledby={multi ? `${panelId}-tab-${segment.id}` : undefined}
        className="flex flex-col gap-4"
      >
        {!multi ? (
          <p className="font-bold">
            {segmentLabel(segment)} · {routeOf(segment)} · {fmt(es.seats.segmentFlight, { flight: segment.flightNumber })}
          </p>
        ) : null}
        <SegmentPanel
          key={segment.id}
          offerId={offerId}
          segment={segment}
          passengers={passengers}
          value={value}
          activePassengerId={activePassengerId}
          filters={filters}
          zoom={zoom}
          view={view}
          focusRequest={focusRequest}
          cabinLabel={cabinLabel}
          onFiltersChange={setFilters}
          onZoomChange={setZoom}
          onViewChange={setView}
          onCommit={commit}
          onAnnounce={announce}
        />
      </div>

      <p role="status" aria-live="polite" className="min-h-6 font-bold">
        {status}
      </p>
      <p role="alert" className={cn('min-h-6 font-bold text-error', !alert && 'sr-only')}>
        {alert}
      </p>
    </section>
  );
}
