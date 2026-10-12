/**
 * Preguntas frecuentes como disclosure nativo (`<details>`/`<summary>`): se abren con Enter o Espacio, los lectores de pantalla
 * anuncian expandido/colapsado y no hace falta JavaScript ni una librería.
 */
export function FaqList({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <details key={item.q} className="group rounded border-2 border-border bg-surface">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 py-2 font-bold marker:text-primary">
            <span className="pl-2">{item.q}</span>
          </summary>
          <p className="px-6 pb-4">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
