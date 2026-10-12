import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { usePageMeta } from '@/shared/lib/usePageMeta';

interface PageProps {
  /** Título de la pestaña del navegador. */
  title: string;
  /** Descripción para buscadores y vistas previas (`<meta name="description">`); sin ella, la general del sitio. */
  description?: string;
  /** Texto del único h1 de la página (por defecto, el título). */
  heading?: ReactNode;
  lead?: ReactNode;
  /** Contenido a la derecha del encabezado (p. ej. una insignia de estado). */
  aside?: ReactNode;
  width?: 'narrow' | 'default';
  className?: string;
  children: ReactNode;
}

/**
 * Esqueleto de toda página interna: un solo h1 que se muestra de inmediato
 * (aunque el contenido aún esté cargando) para que el foco de ruta tenga dónde caer.
 */
export function Page({ title, description, heading, lead, aside, width = 'default', className, children }: PageProps) {
  usePageMeta(title, description);
  return (
    <div className={cn('container-page flex flex-col gap-8 py-12', width === 'narrow' && 'max-w-[48rem]', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl md:text-4xl">{heading ?? title}</h1>
          {lead ? <p className="text-lg text-muted">{lead}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}
