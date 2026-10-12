/** "a, b y c": une una lista con comas y una "y" antes del último elemento. */
export function joinList(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}
