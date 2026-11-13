import { InvoicePaymentStatus } from '@models/ersRegistration.model';

/**
 * The Ionic colour used everywhere an invoice payment status is shown, so the list and the detail page agree.
 */
export function invoicePaymentStatusColor(status: InvoicePaymentStatus): string {
  switch (status) {
    case InvoicePaymentStatus.CONFIRMED:
      return 'success';
    case InvoicePaymentStatus.PAID:
      return 'warning';
    default:
      return 'medium';
  }
}
