/**
 * Qué falta y qué hay que corregir en un formulario, a partir de los problemas de zod, para `FormStatus` junto al botón de
 * enviar. Cada problema se cuenta una vez por campo: si el campo está vacío «falta», y si tiene algo escrito «hay que revisarlo».
 * Las rutas se unen con punto (`traveler.firstName`) y `labelOf` da el nombre en minúsculas; un campo sin nombre no se cuenta.
 */
export function pendingFromIssues(
  issues: readonly { path: readonly (string | number)[] }[],
  valueOf: (path: string) => unknown,
  labelOf: (path: string) => string | undefined,
): { missing: string[]; invalid: string[] } {
  const missing: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const path = issue.path.join('.');
    const label = labelOf(path);
    if (!label || seen.has(path)) continue;
    seen.add(path);
    const value = valueOf(path);
    const empty = value === undefined || value === null || value === false || (typeof value === 'string' && value.trim() === '');
    (empty ? missing : invalid).push(label);
  }
  return { missing, invalid };
}
