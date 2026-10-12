import { useMemo } from 'react';
import { get, useWatch, type Control, type FieldErrors, type FieldValues, type Path, type PathValue, type UseFormRegister, type UseFormSetValue } from 'react-hook-form';
import { es } from '@/shared/i18n';
import { countries, isBookableCountry } from '@/shared/lib/countries';
import { maskDateInput } from '@/shared/lib/dates';
import { onlyDigits, onlyLetters } from '@/shared/lib/validators';
import { Field, Input, Select } from '@/shared/ui';
import { isEcuadorianId, sanitizeDocument, type DocumentType } from './documents';
import type { TravelerKey } from './traveler';

const f = es.checkoutForms;
const t = es.travelerForm;

/** Nombre del campo en el formulario → sufijo de su id (para enlazar etiqueta, ayuda y error y llevar el foco). */
const ID_SUFFIX: Record<TravelerKey, string> = {
  firstName: 'first',
  lastName: 'last',
  documentType: 'doctype',
  documentNumber: 'doc',
  nationality: 'nat',
  gender: 'gender',
  birthDate: 'birth',
  documentExpiryDate: 'exp',
  email: 'email',
  phone: 'phone',
};

export interface TravelerFieldsProps<T extends FieldValues> {
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
  control: Control<T>;
  errors: FieldErrors<T>;
  /** Ruta del grupo dentro del formulario (p. ej. `traveler`); sin ella, los campos están en la raíz. */
  name?: string;
  /** Prefijo de los ids (dos formularios en la misma página no deben repetirlos). */
  idPrefix: string;
  /** Pista del correo de contacto (por defecto, «te enviamos aquí los detalles de tus compras»). */
  contactHint?: string;
}

/**
 * Los campos de los datos de quien viaja, en el MISMO orden de pares que el paso de pasajeros de la compra: nombres y apellidos,
 * documento y número, nacionalidad y sexo, nacimiento y vencimiento del pasaporte, y debajo el contacto (correo y celular). Los
 * usan el registro y Mi perfil. Se valida al salir de cada campo (el esquema es de quien lo usa, `travelerSchema`); los nombres
 * no admiten números ni signos, el documento solo lo que su tipo permite y las fechas no dejan escribir un mes 13.
 */
export function TravelerFields<T extends FieldValues>({ register, setValue, control, errors, name, idPrefix, contactHint = t.contactEmailHint }: TravelerFieldsProps<T>) {
  const list = useMemo(() => countries(), []);
  const path = (key: TravelerKey) => (name ? `${name}.${key}` : key) as Path<T>;
  const id = (key: TravelerKey) => `${idPrefix}-${ID_SUFFIX[key]}`;
  const message = (key: TravelerKey) => (get(errors, path(key)) as { message?: string } | undefined)?.message;
  // Al limpiar lo que se teclea (solo letras, máscara de fecha…) el valor cambia por debajo de la validación: si el campo ya mostraba un
  // error, se vuelve a validar con el valor limpio para que el mensaje no quede pegado a algo que ya está bien.
  const set = (key: TravelerKey, value: string) => setValue(path(key), value as PathValue<T, Path<T>>, { shouldValidate: !!message(key) });

  const documentType = (useWatch({ control, name: path('documentType') }) as DocumentType | undefined) ?? 'NATIONAL_ID';
  const nationality = (useWatch({ control, name: path('nationality') }) as string | undefined) ?? 'EC';
  const documentNumber = (useWatch({ control, name: path('documentNumber') }) as string | undefined) ?? '';
  const document = { documentType, nationality };
  const cedula = isEcuadorianId(document);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field id={id('firstName')} label={f.firstName} error={message('firstName')} required>
          <Input autoComplete="given-name" maxLength={60} {...register(path('firstName'), { onChange: (e) => set('firstName', onlyLetters(e.target.value)) })} />
        </Field>
        <Field id={id('lastName')} label={f.lastName} error={message('lastName')} required>
          <Input autoComplete="family-name" maxLength={60} {...register(path('lastName'), { onChange: (e) => set('lastName', onlyLetters(e.target.value)) })} />
        </Field>
        <Field id={id('documentType')} label={f.documentType} required>
          <Select
            options={[
              { value: 'NATIONAL_ID', label: es.documents.cedula },
              { value: 'PASSPORT', label: es.documents.passport },
            ]}
            {...register(path('documentType'), { onChange: (e) => set('documentNumber', sanitizeDocument({ documentType: e.target.value as DocumentType, nationality }, documentNumber)) })}
          />
        </Field>
        <Field id={id('documentNumber')} label={f.documentNumber} hint={cedula ? es.documents.cedulaHint : es.documents.passportHint} error={message('documentNumber')} required>
          <Input
            autoComplete="off"
            inputMode={cedula ? 'numeric' : 'text'}
            maxLength={cedula ? 10 : 20}
            {...register(path('documentNumber'), { onChange: (e) => set('documentNumber', sanitizeDocument(document, e.target.value)) })}
          />
        </Field>
        <Field id={id('nationality')} label={f.nationality} hint={isBookableCountry(nationality) ? undefined : t.nationalityNotBookable} error={message('nationality')} required>
          <Select
            options={list.map((c) => ({ value: c.code, label: c.name }))}
            autoComplete="country"
            {...register(path('nationality'), { onChange: (e) => set('documentNumber', sanitizeDocument({ documentType, nationality: e.target.value }, documentNumber)) })}
          />
        </Field>
        <Field id={id('gender')} label={f.gender} error={message('gender')} required>
          <Select
            placeholder={f.genderChoose}
            options={[
              { value: 'F', label: f.genderF },
              { value: 'M', label: f.genderM },
              { value: 'X', label: f.genderX },
            ]}
            {...register(path('gender'))}
          />
        </Field>
        <Field id={id('birthDate')} label={f.birthDate} hint={`${f.dateHint} ${f.birthRule.ADULT}`} error={message('birthDate')} required>
          <Input inputMode="numeric" autoComplete="bday" maxLength={10} {...register(path('birthDate'), { onChange: (e) => set('birthDate', maskDateInput(e.target.value)) })} />
        </Field>
        {documentType === 'PASSPORT' ? (
          <Field id={id('documentExpiryDate')} label={f.documentExpiry} hint={f.dateHint} error={message('documentExpiryDate')} required>
            <Input inputMode="numeric" autoComplete="off" maxLength={10} {...register(path('documentExpiryDate'), { onChange: (e) => set('documentExpiryDate', maskDateInput(e.target.value)) })} />
          </Field>
        ) : null}
      </div>

      <div className="grid items-start gap-4 border-t-2 border-border pt-4 sm:grid-cols-2">
        <p className="font-bold sm:col-span-2">{t.contactTitle}</p>
        <Field id={id('email')} label={t.contactEmail} hint={contactHint} error={message('email')} required>
          <Input type="email" autoComplete="email" inputMode="email" spellCheck={false} autoCapitalize="none" {...register(path('email'))} />
        </Field>
        <Field id={id('phone')} label={f.phone} hint={f.phoneHint} error={message('phone')} required>
          <Input inputMode="numeric" autoComplete="tel-national" prefix="+593" maxLength={9} {...register(path('phone'), { onChange: (e) => set('phone', onlyDigits(e.target.value).slice(0, 9)) })} />
        </Field>
      </div>
    </div>
  );
}
