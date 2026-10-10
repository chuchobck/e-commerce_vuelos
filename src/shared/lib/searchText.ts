/** Minúsculas y sin tildes: "Cuenca", "cuenca" y "CUÉNCA" son lo mismo al buscar mientras se escribe. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export interface Matchable {
  label: string;
  /** Otras palabras por las que también se encuentra (código, nombre del aeropuerto, apodos). */
  keywords?: readonly string[];
}

/**
 * Filtra y ordena por relevancia: primero lo que empieza con lo escrito (en la etiqueta, luego en
 * otra palabra clave), después lo que lo contiene. Sin texto devuelve todo en su orden.
 */
export function rankMatches<T extends Matchable>(items: readonly T[], query: string): T[] {
  const q = normalizeSearch(query);
  if (!q) return [...items];
  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const label = normalizeSearch(item.label);
    const words = (item.keywords ?? []).map(normalizeSearch);
    let score = -1;
    if (label.startsWith(q)) score = 0;
    else if (label.split(/[\s()]+/).some((w) => w.startsWith(q))) score = 1;
    else if (words.some((w) => w.startsWith(q))) score = 2;
    else if (label.includes(q)) score = 3;
    else if (words.some((w) => w.includes(q))) score = 4;
    if (score >= 0) scored.push({ item, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.item);
}

/** Parte `text` en [antes, coincidencia, después] para resaltar lo escrito (ignora tildes y mayúsculas). */
export function splitMatch(text: string, query: string): [string, string, string] {
  const q = normalizeSearch(query);
  if (!q) return [text, '', ''];
  // Se normaliza carácter a carácter para conservar las posiciones del texto original.
  let plain = '';
  const positions: number[] = [];
  [...text].forEach((ch, i) => {
    const n = normalizeSearch(ch);
    for (const c of n) {
      plain += c;
      positions.push(i);
    }
  });
  const at = plain.indexOf(q);
  if (at < 0) return [text, '', ''];
  const chars = [...text];
  const start = positions[at];
  const end = positions[at + q.length - 1] + 1;
  return [chars.slice(0, start).join(''), chars.slice(start, end).join(''), chars.slice(end).join('')];
}
