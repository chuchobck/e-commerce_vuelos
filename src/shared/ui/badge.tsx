import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-2 rounded-full border-2 px-4 py-px text-sm font-bold [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        success: 'border-success bg-success-tint text-foreground',
        warning: 'border-warning bg-warning-tint text-foreground',
        error: 'border-error bg-error-tint text-foreground',
        info: 'border-primary bg-primary-tint text-foreground',
        neutral: 'border-input bg-background text-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

const ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Clock,
  neutral: Circle,
} as const;

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: ReactNode;
  className?: string;
}

/** Etiqueta de estado (reserva, vuelo). Siempre icono + texto. */
export function Badge({ tone, children, className }: BadgeProps) {
  const Icon = ICONS[tone ?? 'neutral'];
  return (
    <span className={cn(badgeVariants({ tone }), className)}>
      <Icon aria-hidden="true" />
      {children}
    </span>
  );
}
