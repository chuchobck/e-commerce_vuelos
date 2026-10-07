import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { cn } from '@/shared/lib/cn';
import { Spinner } from './spinner';

export const buttonVariants = cva(
  [
    'inline-flex select-none items-center justify-center gap-2 rounded border-2 font-bold no-underline',
    'transition-colors duration-150 motion-reduce:transition-none',
    'disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed',
    '[&_svg]:size-6 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary:
          'border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover',
        /** Destacado: relleno acento con texto oscuro. El borde oscuro evita depender solo del color. */
        accent:
          'border-accent-foreground/80 bg-accent text-accent-foreground hover:bg-accent-hover',
        secondary:
          'border-primary bg-surface text-primary hover:bg-primary-tint',
        ghost:
          'border-transparent bg-transparent text-primary hover:bg-primary-tint',
        danger:
          'border-error bg-error text-error-foreground hover:opacity-90',
      },
      size: {
        md: 'min-h-12 px-6 text-base',
        lg: 'min-h-14 px-8 text-lg',
        icon: 'size-12 p-0',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Muestra el estado de carga sin perder el foco ni permitir doble envío. */
  loading?: boolean;
  /** Texto visible mientras carga (p. ej. "Buscando vuelos…"). */
  loadingText?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, fullWidth, asChild = false, loading = false, loadingText, children, onClick, type, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      if (loading) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    };

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size, fullWidth }), loading && 'cursor-progress', className)}
        aria-busy={loading || undefined}
        aria-disabled={loading || undefined}
        onClick={handleClick}
        {...props}
      >
        {loading ? <Spinner /> : null}
        <Slottable>{loading && loadingText ? loadingText : children}</Slottable>
      </Comp>
    );
  },
);
Button.displayName = 'Button';
