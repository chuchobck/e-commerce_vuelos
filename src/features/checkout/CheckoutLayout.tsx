import type { ReactNode } from 'react';

/**
 * Dos columnas desde 1024 px (contenido y panel lateral fijo); en móvil el panel va arriba y el
 * resumen se pliega. El panel nunca queda sobre los campos: es una columna, no una barra fija.
 */
export function CheckoutLayout({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-8 lg:order-first">{children}</div>
      <div className="order-first lg:order-last lg:sticky lg:top-28">{aside}</div>
    </div>
  );
}
