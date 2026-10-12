import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { get, useForm, useWatch } from 'react-hook-form';
import { es } from '@/shared/i18n';
import { pendingFromIssues } from '@/shared/lib/formStatus';
import { emptyTraveler, normalizeTraveler, perfilViajero, TRAVELER_KEYS, TravelerFields, travelerSchema, usePerfilViajero, type TravelerKey, type TravelerValues } from '@/shared/profile';
import { Alert, Button, FormStatus, toast } from '@/shared/ui';
import { ForgetProfileDialog } from './ForgetProfileDialog';

const p = es.profile;
const f = es.checkoutForms;
const t = es.travelerForm;

const LABELS: Record<TravelerKey, string> = {
  firstName: f.firstName,
  lastName: f.lastName,
  documentType: f.documentType,
  documentNumber: f.documentNumber,
  nationality: f.nationality,
  gender: f.gender,
  birthDate: f.birthDate,
  documentExpiryDate: f.documentExpiry,
  email: t.contactEmail,
  phone: f.phone,
};
const labelOf = (path: string) => (TRAVELER_KEYS as readonly string[]).includes(path) ? LABELS[path as TravelerKey].toLowerCase() : undefined;

/**
 * Mi perfil de viajero: los datos guardados en este dispositivo, con las mismas reglas y los mismos campos que el registro y
 * el pasajero 1 de la compra. Solo se puede guardar cuando no falta nada (el estado junto al botón dice qué falta); si lo
 * guardado está incompleto o desactualizado, se ve igual y se marca lo que hay que completar. «Borrar mis datos guardados»
 * lo quita de este dispositivo (la cuenta no cambia). `userId` es el de la sesión: cada usuario tiene su perfil.
 */
export function ProfileForm({ userId, accountEmail }: { userId: string; accountEmail: string }) {
  const { profile, saved } = usePerfilViajero(userId);
  const schema = useMemo(() => travelerSchema(), []);
  const [saveError, setSaveError] = useState(false);
  const [forgetOpen, setForgetOpen] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<TravelerValues>({
    resolver: zodResolver(schema),
    defaultValues: profile ?? emptyTraveler(accountEmail),
    mode: 'onTouched',
    shouldFocusError: true,
  });
  const values = useWatch({ control }) as TravelerValues;

  // Si el perfil se borra (aquí o en otra pestaña), el formulario vuelve a estar vacío.
  const wasSaved = useRef(saved);
  useEffect(() => {
    if (wasSaved.current && !saved) reset(emptyTraveler(accountEmail));
    wasSaved.current = saved;
  }, [saved, accountEmail, reset]);

  const parsed = schema.safeParse(values);
  const pending = parsed.success ? { missing: [], invalid: [] } : pendingFromIssues(parsed.error.issues, (path) => get(values, path), labelOf);

  const onValid = (input: TravelerValues) => {
    const data = normalizeTraveler(input);
    if (perfilViajero.save(userId, data)) {
      setSaveError(false);
      reset(data);
      toast({ title: p.saved, variant: 'success' });
    } else {
      setSaveError(true);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted">{p.travelerLead}</p>
      {!saved ? (
        <p className="flex items-start gap-2 font-bold">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <span>{p.travelerEmpty}</span>
        </p>
      ) : null}
      {saveError ? (
        <Alert variant="error" live="assertive">
          <p>{p.saveFailed}</p>
        </Alert>
      ) : null}

      <form noValidate aria-label={p.travelerTitle} onSubmit={(event) => void handleSubmit(onValid)(event)} className="flex flex-col gap-6">
        <TravelerFields<TravelerValues> register={register} setValue={setValue} control={control} errors={errors} idPrefix="perfil" />
        <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-border pt-6">
          <FormStatus id="perfil-status" ready={parsed.success} missing={pending.missing} invalid={pending.invalid} readyText={p.saveReady} className="min-w-0 flex-1 basis-60" />
          <div className="flex flex-wrap items-center gap-4">
            {saved ? (
              <Button type="button" variant="secondary" onClick={() => setForgetOpen(true)}>
                <Trash2 aria-hidden="true" />
                {p.forget}
              </Button>
            ) : null}
            <Button type="submit" disabled={!parsed.success} aria-describedby="perfil-status">
              <Save aria-hidden="true" />
              {p.save}
            </Button>
          </div>
        </div>
      </form>
      <ForgetProfileDialog open={forgetOpen} onOpenChange={setForgetOpen} userId={userId} />
    </div>
  );
}
