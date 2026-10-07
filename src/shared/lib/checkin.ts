/** Reglas de la API (README, sección 6): el check-in abre 48 h antes de la salida y cierra 60 min antes. */
export const CHECKIN_OPENS_HOURS = 48;
export const CHECKIN_CLOSES_MINUTES = 60;

export type CheckInWindow =
  /** `opensAtLocal`: ISO con el desfase del aeropuerto de salida, para mostrar fecha y hora locales. */
  | { status: 'not-open'; opensAt: Date; opensAtLocal: string }
  | { status: 'open'; closesAt: Date }
  | { status: 'closed' };

/**
 * Apertura en hora del aeropuerto: 48 h son exactamente 2 días y Ecuador no cambia de horario,
 * así que basta restar los días a la fecha y conservar hora y desfase ("…T07:45:00-05:00").
 */
function opensAtLocal(departureIso: string): string {
  const day = new Date(`${departureIso.slice(0, 10)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - CHECKIN_OPENS_HOURS / 24);
  return day.toISOString().slice(0, 10) + departureIso.slice(10);
}

/** Estado de la ventana de check-in para una salida (ISO con desfase). Abierta en [salida − 48 h, salida − 60 min). */
export function checkInWindow(departureIso: string, now: Date = new Date()): CheckInWindow {
  const dep = new Date(departureIso).getTime();
  const opensAt = new Date(dep - CHECKIN_OPENS_HOURS * 3_600_000);
  const closesAt = new Date(dep - CHECKIN_CLOSES_MINUTES * 60_000);
  if (now.getTime() < opensAt.getTime()) return { status: 'not-open', opensAt, opensAtLocal: opensAtLocal(departureIso) };
  if (now.getTime() >= closesAt.getTime()) return { status: 'closed' };
  return { status: 'open', closesAt };
}
