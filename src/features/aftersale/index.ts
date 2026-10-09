/**
 * Postventa de una reserva: equipaje extra, cambio de fecha y cancelación (F6). La lógica es pura o va en hooks; las pantallas
 * (src/pages) arman estas piezas. Solo lo que se exporte aquí es público.
 */
export { absMoney, amountDue, needsPayment, newDateProblem, priceDirection, suggestedDate, type NewDateProblem, type PriceDirection } from './dateChange';
export { baggageTotal, lineKey, remainingFor, selectedLines, totalBags, type BaggageLine, type BaggageSelection } from './baggage';
export { BaggageSelector } from './BaggageSelector';
export { classifyPaymentError, type PaymentProblem } from './outcome';
export { isPaymentReference, newPaymentReference, referenceFor, PAYMENT_REFERENCE } from './paymentReference';
export { PaymentField } from './PaymentField';
export { PostSaleNotice } from './PostSaleNotice';
export { baggageScope, overallOf, purchaseBaggage, type BaggageDeps, type BaggageOverall, type BaggageToBuy, type LineResult, type LineStatus } from './purchaseBaggage';
export { DateChangeOptions } from './DateChangeOptions';
export { DateChangePrice } from './DateChangePrice';
export { useCancellation, type CancellationState } from './useCancellation';
export { useDateChange, type DateChangeState, type DateChangeStep } from './useDateChange';
