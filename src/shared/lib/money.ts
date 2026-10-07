/**
 * Dinero como centavos enteros. La API entrega los montos como texto decimal ("94.38"):
 * se convierten sin pasar por flotantes y las sumas se hacen en enteros.
 */
export interface Money {
  /** Monto en centavos (entero). */
  cents: number;
  /** Código ISO 4217, por ejemplo "USD". */
  currency: string;
}

const DECIMAL = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** "94.38" → 9438 centavos. Lanza si el texto no es un monto válido de hasta 2 decimales. */
export function parseMoney(amount: string, currency: string): Money {
  const match = DECIMAL.exec(amount.trim());
  if (!match) throw new Error(`Monto inválido: "${amount}"`);
  const [, sign, units, decimals = ''] = match;
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, '0'));
  return { cents: sign ? -cents : cents, currency };
}

export function zeroMoney(currency = 'USD'): Money {
  return { cents: 0, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`No se pueden sumar ${a.currency} y ${b.currency}`);
  return { cents: a.cents + b.cents, currency: a.currency };
}

/** Multiplica por una cantidad entera (por ejemplo, número de pasajeros). */
export function multiplyMoney(m: Money, times: number): Money {
  if (!Number.isInteger(times)) throw new Error('Solo se multiplica por enteros');
  return { cents: m.cents * times, currency: m.currency };
}

export function sumMoney(list: Money[], currency = 'USD'): Money {
  return list.reduce(addMoney, zeroMoney(list[0]?.currency ?? currency));
}

export function minMoney(list: Money[]): Money | undefined {
  return list.reduce<Money | undefined>((min, m) => (!min || m.cents < min.cents ? m : min), undefined);
}

/** 9438 → "94.38" (el formato del contrato, para enviar a la API). */
export function toDecimalString(m: Money): string {
  const abs = Math.abs(m.cents);
  return `${m.cents < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
