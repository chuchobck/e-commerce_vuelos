import { List, Map as MapIcon, RefreshCw, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import type { SeatState } from '../model/describe';
import { hasFilters, matchesFilters, togetherSeats, type SeatFilters } from '../model/filters';
import type { SeatCell } from '../model/layout';
import { recommendSeats } from '../model/recommend';
import { assignSeat, clearSeat, clearSegment, holderOf, nextWithoutSeat, seatablePassengers, seatOf } from '../model/selection';
import type { SeatAssignments, SeatPassenger, SeatSegment } from '../types';
import { useSeatMap } from '../useSeatMap';
import { SeatFiltersBar } from './SeatFiltersBar';
import { SeatLegend } from './SeatLegend';
import { SeatList } from './SeatList';
import { SeatMapView, type SeatHolder } from './SeatMapView';
import { ZoomControls } from './ZoomControls';

const t = es.seats;

export type SeatView = 'map' | 'list';

interface SegmentPanelProps {
  offerId: string;
  segment: SeatSegment;
  passengers: SeatPassenger[];
  value: SeatAssignments;
  activePassengerId: string | undefined;
  filters: SeatFilters;
  zoom: number;
  view: SeatView;
  focusRequest?: { segmentId: string; seat: string; nonce: number };
  cabinLabel: (cabin: string) => string;
  onFiltersChange: (filters: SeatFilters) => void;
  onZoomChange: (zoom: number) => void;
  onViewChange: (view: SeatView) => void;
  /** Cambia lo elegido, anuncia el resultado y, si se indica, pasa al siguiente pasajero. */
  onCommit: (next: SeatAssignments, message: string, nextActiveId?: string) => void;
  onAnnounce: (message: string, kind?: 'status' | 'alert') => void;
}

/**
 * Un tramo: pide su mapa, muestra filtros, acciones, leyenda y el mapa o la lista, y resuelve
 * cada elección (elegir, quitar, recomendar, asignar automáticamente).
 */
export function SegmentPanel({
  offerId,
  segment,
  passengers,
  value,
  activePassengerId,
  filters,
  zoom,
  view,
  focusRequest,
  cabinLabel,
  onFiltersChange,
  onZoomChange,
  onViewChange,
  onCommit,
  onAnnounce,
}: SegmentPanelProps) {
  const { status, layout, error, refreshing, refresh } = useSeatMap(offerId, segment.id);
  const cabin = segment.cabin;
  const seatable = useMemo(() => seatablePassengers(passengers), [passengers]);
  const active = seatable.find((p) => p.id === activePassengerId) ?? seatable[0];

  const together = useMemo(
    () => (layout && filters.together ? togetherSeats(layout, cabin, seatable.length, (s) => s.available) : undefined),
    [layout, filters.together, cabin, seatable.length],
  );
  const canTogether = seatable.length >= 2;
  const effective = useMemo(() => (canTogether ? filters : { ...filters, together: false }), [filters, canTogether]);

  if (status === 'loading') return <LoadingState label={t.loadingMap} skeletons={1} />;
  if (status === 'error' || !layout) return <ErrorState error={error} title={t.errorTitle} onRetry={() => void refresh()} headingLevel="h3" />;
  const cabinSeats = layout.rows.filter((r) => r.cabin === cabin).flatMap((r) => r.seats);
  if (cabinSeats.length === 0) return <EmptyState title={t.emptyTitle} text={t.emptyText} headingLevel="h3" />;

  const stateOf = (seat: SeatCell): { state: SeatState; holder?: SeatHolder } => {
    const holderId = holderOf(value, segment.id, seat.number);
    if (holderId) {
      const index = passengers.findIndex((p) => p.id === holderId);
      return { state: 'selected', holder: { name: passengers[index]?.name ?? '', number: index + 1, isActive: holderId === active?.id } };
    }
    if (seat.cabin !== cabin) return { state: 'otherCabin' };
    return { state: seat.available ? 'free' : 'taken' };
  };
  const matches = (seat: SeatCell) => matchesFilters(seat, effective, together);
  const matching = cabinSeats.filter((s) => stateOf(s).state === 'free' && matches(s)).length;

  const select = (seat: SeatCell) => {
    if (!active) return onAnnounce(t.announceNoPassenger, 'alert');
    const { state, holder } = stateOf(seat);
    if (state === 'taken') return onAnnounce(fmt(t.announceTaken, { seat: seat.number }), 'alert');
    if (state === 'otherCabin') return onAnnounce(fmt(t.announceOtherCabin, { seat: seat.number }), 'alert');
    if (state === 'selected' && !holder?.isActive) {
      return onAnnounce(fmt(t.announceHeld, { seat: seat.number, name: holder?.name ?? '' }), 'alert');
    }
    if (state === 'selected') {
      return onCommit(clearSeat(value, active.id, segment.id), fmt(t.announceRemoved, { seat: seat.number, name: active.name }));
    }
    const next = assignSeat(value, active.id, segment.id, seat.number);
    const following = nextWithoutSeat(passengers, next, segment.id, active.id);
    const message = [
      fmt(t.announceChosen, { seat: seat.number, name: active.name }),
      following ? fmt(t.announceNext, { name: following.name }) : t.announceAllDone,
    ].join(' ');
    onCommit(next, message, following?.id);
  };

  const recommend = () => {
    const needy = seatable.filter((p) => !seatOf(value, p.id, segment.id));
    const targets = needy.length > 0 ? needy : seatable;
    const ids = new Set(targets.map((p) => p.id));
    const blocked = new Set(
      seatable.filter((p) => !ids.has(p.id)).flatMap((p) => (seatOf(value, p.id, segment.id) ? [seatOf(value, p.id, segment.id)!] : [])),
    );
    const seats = recommendSeats(layout, {
      cabin,
      count: targets.length,
      filters: effective,
      blocked,
      avoidExit: targets.some((p) => p.type === 'CHILD'),
    });
    if (seats.length === 0) return onAnnounce(t.recommendNone, 'alert');
    let next = targets.reduce((acc, p) => clearSeat(acc, p.id, segment.id), value);
    targets.forEach((p, i) => {
      if (seats[i]) next = assignSeat(next, p.id, segment.id, seats[i]);
    });
    onCommit(next, fmt(t.recommendDone, { seats: seats.join(', ') }));
  };

  const chosenHere = seatable.some((p) => seatOf(value, p.id, segment.id));
  const preferred = active ? seatOf(value, active.id, segment.id) : undefined;
  const focus = focusRequest?.segmentId === segment.id ? { seat: focusRequest.seat, nonce: focusRequest.nonce } : undefined;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{fmt(t.yourCabin, { cabin: cabinLabel(cabin) })}</p>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label={t.viewLabel} className="flex gap-2">
          {(['map', 'list'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => onViewChange(option)}
              className={cn(
                'flex min-h-12 items-center gap-2 rounded border-2 px-4 text-sm font-bold',
                view === option ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-surface hover:bg-primary-tint',
              )}
            >
              {option === 'map' ? <MapIcon aria-hidden="true" className="size-4" /> : <List aria-hidden="true" className="size-4" />}
              {option === 'map' ? t.viewMap : t.viewList}
            </button>
          ))}
        </div>
        {view === 'map' ? <ZoomControls zoom={zoom} onChange={onZoomChange} /> : null}
      </div>

      <SeatFiltersBar filters={effective} onChange={onFiltersChange} canTogether={canTogether} />
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="accent" onClick={recommend} disabled={!active} aria-describedby="seat-recommend-hint">
          <Sparkles aria-hidden="true" />
          {t.recommend}
        </Button>
        <span id="seat-recommend-hint" className="sr-only">
          {t.recommendHint}
        </span>
        <Button
          variant="secondary"
          disabled={!chosenHere}
          onClick={() => onCommit(clearSegment(value, segment.id), t.autoSegmentDone)}
        >
          {t.autoSegment}
        </Button>
        {hasFilters(effective) ? (
          <Button variant="ghost" onClick={() => onFiltersChange({ window: false, aisle: false, together: false, extraSpace: false })}>
            {t.filtersClear}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => void refresh()} loading={refreshing} loadingText={t.refreshing}>
          <RefreshCw aria-hidden="true" />
          {t.refresh}
        </Button>
      </div>

      {hasFilters(effective) ? (
        <p role="status" className="text-sm font-bold">
          {matching === 0 ? t.filterCountNone : matching === 1 ? t.filterCountOne : fmt(t.filterCount, { count: matching })}
        </p>
      ) : null}

      <SeatLegend />

      {view === 'map' ? (
        <SeatMapView
          layout={layout}
          cabin={cabin}
          label={fmt(t.mapLabel, { flight: segment.flightNumber, route: fmt(t.segmentRoute, { origin: segment.origin, destination: segment.destination }) })}
          zoom={zoom}
          stateOf={stateOf}
          matches={matches}
          onSelect={select}
          focusRequest={focus}
          preferredSeat={preferred}
          cabinLabel={cabinLabel}
        />
      ) : (
        <SeatList
          cabins={layout.cabins}
          cabin={cabin}
          caption={fmt(t.listCaption, { flight: segment.flightNumber, route: fmt(t.segmentRoute, { origin: segment.origin, destination: segment.destination }) })}
          cabinLabel={fmt(t.cabinRowGroup, { cabin: cabinLabel(cabin) })}
          stateOf={stateOf}
          matches={matches}
          activeName={active?.name}
          onSelect={select}
        />
      )}
    </div>
  );
}
