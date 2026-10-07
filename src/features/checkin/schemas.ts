import { z } from 'zod';
import { bookingCodeField, nameField } from '@/shared/lib/schemas';

export const CheckInSchema = z.object({
  bookingCode: bookingCodeField,
  lastName: nameField,
});
export type CheckInInput = z.infer<typeof CheckInSchema>;
