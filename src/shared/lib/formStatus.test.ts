import { describe, expect, it } from 'vitest';
import { pendingFromIssues } from './formStatus';

const labels: Record<string, string> = { email: 'correo', 'traveler.firstName': 'nombres', 'traveler.phone': 'celular', terms: 'términos' };

describe('pendingFromIssues', () => {
  const values: Record<string, unknown> = { email: 'ana@', 'traveler.firstName': '', 'traveler.phone': '12', terms: false };
  const run = (issues: { path: (string | number)[] }[]) => pendingFromIssues(issues, (p) => values[p], (p) => labels[p]);

  it('separa lo vacío (falta) de lo escrito que hay que corregir (revisar), con rutas anidadas', () => {
    expect(run([{ path: ['email'] }, { path: ['traveler', 'firstName'] }, { path: ['traveler', 'phone'] }, { path: ['terms'] }])).toEqual({
      missing: ['nombres', 'términos'],
      invalid: ['correo', 'celular'],
    });
  });

  it('cuenta un campo una sola vez aunque tenga varios problemas y se salta los que no tienen nombre', () => {
    expect(run([{ path: ['email'] }, { path: ['email'] }, { path: ['otro'] }])).toEqual({ missing: [], invalid: ['correo'] });
  });
});
