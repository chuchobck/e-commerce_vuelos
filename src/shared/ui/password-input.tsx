import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { es } from '@/shared/i18n';
import { Input, type InputProps } from './input';

/**
 * Contraseña con botón de 48 px para mostrarla u ocultarla. Permite pegar y autocompletar
 * (WCAG 3.3.8: sin pruebas cognitivas para autenticarse).
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'endAdornment'>>((props, ref) => {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Input
        ref={ref}
        {...props}
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="none"
        endAdornment={
          <button
            type="button"
            aria-pressed={visible}
            aria-label={es.common.showPassword}
            onClick={() => setVisible((v) => !v)}
            className="mr-px inline-flex size-12 items-center justify-center rounded text-primary hover:bg-primary-tint"
          >
            {visible ? <EyeOff aria-hidden="true" className="size-6" /> : <Eye aria-hidden="true" className="size-6" />}
          </button>
        }
      />
      <span aria-live="polite" className="sr-only">
        {visible ? es.common.passwordShown : ''}
      </span>
    </>
  );
});
PasswordInput.displayName = 'PasswordInput';
