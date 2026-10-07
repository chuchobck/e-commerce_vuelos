import { ZoomIn, ZoomOut } from 'lucide-react';
import { es, fmt } from '@/shared/i18n';
import { Button } from '@/shared/ui';

const t = es.seats;

export const ZOOM_LEVELS = [1, 1.25, 1.5, 2] as const;

interface ZoomControlsProps {
  zoom: number;
  onChange: (zoom: number) => void;
}

/** Zoom del mapa con botones (alternativa a los gestos de pellizco, WCAG 2.5.7). */
export function ZoomControls({ zoom, onChange }: ZoomControlsProps) {
  const index = ZOOM_LEVELS.findIndex((z) => z === zoom);
  return (
    <div role="group" aria-label={t.zoomLabel} className="flex items-center gap-2">
      <Button variant="secondary" size="icon" aria-label={t.zoomOut} disabled={index <= 0} onClick={() => onChange(ZOOM_LEVELS[index - 1])}>
        <ZoomOut aria-hidden="true" />
      </Button>
      <span role="status" className="min-w-16 text-center text-sm font-bold tabular-nums">
        {fmt(t.zoomValue, { percent: Math.round(zoom * 100) })}
      </span>
      <Button
        variant="secondary"
        size="icon"
        aria-label={t.zoomIn}
        disabled={index >= ZOOM_LEVELS.length - 1}
        onClick={() => onChange(ZOOM_LEVELS[index + 1])}
      >
        <ZoomIn aria-hidden="true" />
      </Button>
    </div>
  );
}
