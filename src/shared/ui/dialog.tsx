import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { forwardRef, useEffect, useState, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';
import { Checkbox } from './checkbox';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

/**
 * Diálogo modal: atrapa el foco, se cierra con Esc y devuelve el foco al botón que lo abrió (Radix).
 * Siempre lleva título (DialogTitle) y botón de cerrar visible de 48 px.
 */
export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose = false, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay/60 animate-fade-in" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-prose -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto',
        'rounded border-2 border-border bg-surface p-6 shadow-raised animate-slide-up',
        className,
      )}
      {...props}
    >
      {children}
      {hideClose ? null : (
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" className="absolute right-2 top-2" aria-label={es.a11y.close}>
            <X aria-hidden="true" />
          </Button>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

export function DialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('pr-12 text-2xl font-bold', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-base text-muted', className)} {...props} />;
}

function DialogFooter({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn('mt-2 flex flex-col-reverse gap-4 sm:flex-row sm:justify-end', className)} {...props} />;
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  /** Acción destructiva: el botón de confirmar usa el estilo de peligro. */
  destructive?: boolean;
  /** Si se da, hay que marcar esta casilla ("Entiendo que esta acción no se puede deshacer") para poder confirmar. */
  acknowledge?: string;
}

/**
 * Confirmación para acciones que no se pueden deshacer (WCAG 3.3.4).
 * El foco inicial va al botón seguro ("No, mantener").
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  loading = false,
  destructive = false,
  acknowledge,
}: ConfirmDialogProps) {
  const [understood, setUnderstood] = useState(false);
  // Cada vez que se abre, la casilla empieza sin marcar.
  useEffect(() => {
    if (!open) setUnderstood(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog" hideClose>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {acknowledge ? <Checkbox label={acknowledge} checked={understood} onCheckedChange={(checked) => setUnderstood(checked === true)} /> : null}
        <DialogFooter>
          <DialogClose asChild>
            {/* Foco inicial en la opción segura de una acción destructiva (patrón alertdialog de WAI-ARIA). */}
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <Button variant="secondary" autoFocus>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button variant={destructive ? 'danger' : 'primary'} loading={loading} disabled={!!acknowledge && !understood} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
