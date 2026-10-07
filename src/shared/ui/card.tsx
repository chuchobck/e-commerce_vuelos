import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded border-2 border-border bg-surface p-6 shadow-card', className)} {...props} />
));
Card.displayName = 'Card';

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex flex-col gap-2', className)} {...props} />;
}

/** El nivel de encabezado lo decide quien usa la tarjeta (`as`) para respetar la jerarquía de la página. */
export function CardTitle({
  as: Tag = 'h2',
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4' }) {
  return <Tag className={cn('text-xl font-bold', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex flex-wrap items-center gap-4', className)} {...props} />;
}
