import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';

export type ToastVariant = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  open: boolean;
}

/* Almacén mínimo para poder lanzar avisos desde cualquier parte (incluso fuera de React). */
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(input: { title: string; description?: string; variant?: ToastVariant }) {
  items = [...items, { id: nextId++, variant: 'info', open: true, ...input }];
  emit();
}

function close(id: number) {
  items = items.map((t) => (t.id === id ? { ...t, open: false } : t));
  emit();
  // Se elimina tras la animación de salida.
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 300);
}

function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
}

const ICONS = {
  info: { Icon: Info, cls: 'border-primary', color: 'text-primary' },
  success: { Icon: CheckCircle2, cls: 'border-success', color: 'text-success' },
  error: { Icon: XCircle, cls: 'border-error', color: 'text-error' },
} as const;

/**
 * Avisos temporales. Radix los anuncia en una región aria-live:
 *  - éxito/info: type="background" (cortés), 8 s, se pausan al pasar el mouse o enfocar.
 *  - error: type="foreground" (asertivo) y no desaparecen solos (WCAG 2.2.1).
 * F8 lleva el foco a la zona de avisos.
 */
export function Toaster() {
  const list = useToasts();
  return (
    <ToastPrimitive.Provider swipeDirection="right" label={es.a11y.notifications}>
      {list.map((t) => {
        const { Icon, cls, color } = ICONS[t.variant];
        return (
          <ToastPrimitive.Root
            key={t.id}
            open={t.open}
            onOpenChange={(open) => (open ? undefined : close(t.id))}
            type={t.variant === 'error' ? 'foreground' : 'background'}
            duration={t.variant === 'error' ? Infinity : 8000}
            className={cn(
              'flex items-start gap-4 rounded border-2 border-l-8 bg-surface p-4 text-foreground shadow-raised',
              'data-[state=open]:animate-slide-up data-[state=closed]:animate-fade-in',
              'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
              cls,
            )}
          >
            <Icon aria-hidden="true" className={cn('size-6 shrink-0', color)} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <ToastPrimitive.Title className="font-bold">{t.title}</ToastPrimitive.Title>
              {t.description ? (
                <ToastPrimitive.Description className="text-sm text-muted">{t.description}</ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close
              aria-label={es.a11y.close}
              className="-m-2 inline-flex size-12 shrink-0 items-center justify-center rounded text-muted hover:bg-primary-tint hover:text-foreground"
            >
              <X aria-hidden="true" className="size-6" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[60] m-0 flex w-full max-w-[26rem] list-none flex-col gap-2 p-4 outline-none" />
    </ToastPrimitive.Provider>
  );
}
