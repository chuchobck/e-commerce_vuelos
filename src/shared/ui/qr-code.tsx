import { lazy, Suspense } from 'react';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import type { QrCodeProps } from './qr-image';

// La librería del QR (unos 50 kB) solo se descarga cuando hay un código que dibujar.
const QrImage = lazy(() => import('./qr-image').then((m) => ({ default: m.QrImage })));

/**
 * Código QR del texto dado, dibujado en el cliente (ver `QrImage`). Mientras carga la librería deja un recuadro del mismo
 * tamaño, así la página no salta.
 */
export function QrCode(props: QrCodeProps) {
  const size = props.size ?? 192;
  return (
    <Suspense
      fallback={
        <div role="img" aria-label={props.label} aria-busy="true" style={{ width: size, height: size }} className={cn('flex max-w-full items-center justify-center rounded border-2 border-border text-sm text-muted', props.className)}>
          {es.a11y.loading}
        </div>
      }
    >
      <QrImage {...props} />
    </Suspense>
  );
}
