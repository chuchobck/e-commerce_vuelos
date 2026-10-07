import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

const alertVariants = cva('flex gap-4 rounded border-2 border-l-8 p-4 text-foreground', {
  variants: {
    variant: {
      info: 'border-primary bg-primary-tint',
      success: 'border-success bg-success-tint',
      warning: 'border-warning bg-warning-tint',
      error: 'border-error bg-error-tint',
    },
  },
  defaultVariants: { variant: 'info' },
});

const ICONS = {
  info: { Icon: Info, color: 'text-primary' },
  success: { Icon: CheckCircle2, color: 'text-success' },
  warning: { Icon: AlertTriangle, color: 'text-warning' },
  error: { Icon: XCircle, color: 'text-error' },
} as const;

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof alertVariants> {
  title?: ReactNode;
  /**
   * "assertive": role="alert" (errores que interrumpen); "polite": role="status";
   * "off": contenido estático presente desde la carga.
   */
  live?: 'assertive' | 'polite' | 'off';
  action?: ReactNode;
}

/** Mensaje en línea. Icono + título + texto: el tipo nunca se comunica solo con color. */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ variant, title, live = 'off', action, className, children, ...props }, ref) => {
    const { Icon, color } = ICONS[variant ?? 'info'];
    const role = live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined;
    return (
      <div ref={ref} role={role} className={cn(alertVariants({ variant }), className)} {...props}>
        <Icon aria-hidden="true" className={cn('size-6 shrink-0', color)} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {title ? <p className="font-bold">{title}</p> : null}
          {children ? <div className="[&_p]:max-w-none">{children}</div> : null}
          {action ? <div className="pt-2">{action}</div> : null}
        </div>
      </div>
    );
  },
);
Alert.displayName = 'Alert';
