import { Copy } from 'lucide-react';
import { es, fmt } from '@/shared/i18n';
import { Button, toast } from '@/shared/ui';

const p = es.purchase;

/** Copia al portapapeles; si el navegador no lo permite, deja el texto seleccionable y lo dice. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Código de reserva (PNR) grande, legible y copiable. */
export function BookingCode({ code }: { code: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded border-2 border-border bg-surface p-6 shadow-card">
      <p className="flex flex-col">
        <span className="text-sm text-muted">{p.bookingCodeLabel}</span>
        {/* select-all: un toque o clic selecciona todo el código aunque no se pueda copiar con el botón. */}
        <span className="select-all text-4xl font-bold tracking-widest tabular-nums" data-testid="booking-code">
          {code}
        </span>
      </p>
      <Button
        variant="secondary"
        aria-label={fmt(p.copyCodeLabel, { code })}
        onClick={() =>
          void copy(code).then((ok) => toast({ title: ok ? p.codeCopied : fmt(p.copyFailed, { code }), variant: ok ? 'success' : 'info' }))
        }
      >
        <Copy aria-hidden="true" />
        {p.copyCode}
      </Button>
    </div>
  );
}
