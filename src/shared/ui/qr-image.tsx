import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';

/** Zona de silencio alrededor del código (el estándar pide 4 módulos). */
const QUIET = 4;

export interface QrCodeProps {
  /** El texto que se codifica, tal cual (en los pases, el `barcode` que entrega la API). */
  value: string;
  /** Nombre accesible del código. */
  label: string;
  /** Lado en píxeles. */
  size?: number;
  className?: string;
}

/** Cuadrícula de módulos del QR, o `null` si el texto no cabe (no se inventa nada: se avisa). */
function modulesOf(value: string): { count: number; dark: [number, number][] } | null {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(value, 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    const dark: [number, number][] = [];
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (qr.isDark(row, col)) dark.push([row, col]);
    return { count, dark };
  } catch {
    return null;
  }
}

/**
 * Dibujo del QR (carga aparte: ver `QrCode`). Código QR dibujado en el cliente como SVG (sin innerHTML). Siempre negro sobre blanco, también en modo oscuro:
 * un lector no reconoce un QR invertido, así que aquí no se usan los tokens del tema.
 */
export function QrImage({ value, label, size = 192, className }: QrCodeProps) {
  const modules = useMemo(() => modulesOf(value), [value]);
  if (!modules) {
    return (
      <p role="img" aria-label={label} className={cn('rounded border-2 border-border p-4 text-sm', className)}>
        {es.aftersale.passes.codeFailed}
      </p>
    );
  }
  const side = modules.count + QUIET * 2;
  const path = modules.dark.map(([row, col]) => `M${col + QUIET} ${row + QUIET}h1v1h-1z`).join('');
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${side} ${side}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn('max-w-full', className)}
    >
      {/* Colores fijos a propósito (ver arriba): negro #000 sobre blanco #fff. */}
      <rect width={side} height={side} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
