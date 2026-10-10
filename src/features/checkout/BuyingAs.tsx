import { UserRound } from 'lucide-react';
import { es, fmt } from '@/shared/i18n';
import { Card } from '@/shared/ui';

/** Con qué cuenta se compra (la cuenta solo tiene correo). Estado del sistema siempre visible en el paso 2. */
export function BuyingAs({ email }: { email: string }) {
  return (
    <Card role="status" className="flex items-center gap-4">
      <UserRound aria-hidden="true" className="size-8 shrink-0 text-primary" />
      <p className="min-w-0 break-words text-lg font-bold">{fmt(es.purchase.buyingAs, { email })}</p>
    </Card>
  );
}
