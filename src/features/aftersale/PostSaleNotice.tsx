import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, Button } from '@/shared/ui';

interface PostSaleNoticeProps {
  tone: 'success' | 'pending' | 'rejected' | 'warning' | 'error';
  title: string;
  children?: ReactNode;
  /** Solo en `pending`: actualizar para ver el final del trámite. */
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshLabel?: string;
  action?: ReactNode;
}

const VARIANT = { success: 'success', pending: 'info', rejected: 'error', warning: 'warning', error: 'error' } as const;

/**
 * Resultado de un trámite de postventa: listo, en proceso (202), rechazado (422) o con error. Se anuncia solo
 * (aria-live): el éxito y el proceso con `polite`, los rechazos y errores con `assertive`.
 */
export function PostSaleNotice({ tone, title, children, onRefresh, refreshing, refreshLabel, action }: PostSaleNoticeProps) {
  const live = tone === 'success' || tone === 'pending' ? 'polite' : 'assertive';
  return (
    <Alert
      variant={VARIANT[tone]}
      live={live}
      title={title}
      action={
        onRefresh || action ? (
          <div className="flex flex-wrap gap-4">
            {onRefresh ? (
              <Button variant="secondary" onClick={onRefresh} loading={refreshing}>
                <RefreshCw aria-hidden="true" />
                {refreshLabel}
              </Button>
            ) : null}
            {action}
          </div>
        ) : undefined
      }
    >
      {children}
    </Alert>
  );
}
