import { es } from '@/shared/i18n';
import { perfilViajero } from '@/shared/profile';
import { ConfirmDialog, toast } from '@/shared/ui';

const p = es.profile;

/**
 * «Borrar mis datos guardados»: confirma (no se puede deshacer) y borra el perfil de viajero de ESTE dispositivo. La cuenta y los
 * viajes no cambian. El foco vuelve a quien abrió el diálogo y el aviso confirma lo que pasó.
 */
export function ForgetProfileDialog({ open, onOpenChange, userId }: { open: boolean; onOpenChange: (open: boolean) => void; userId: string | undefined }) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={p.forgetTitle}
      description={p.forgetText}
      confirmLabel={p.forgetConfirm}
      cancelLabel={p.forgetKeep}
      destructive
      onConfirm={() => {
        onOpenChange(false);
        perfilViajero.remove(userId);
        toast({ title: p.forgotten, variant: 'success' });
      }}
    />
  );
}
