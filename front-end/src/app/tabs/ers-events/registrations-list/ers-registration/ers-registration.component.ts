import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

import { AppService } from '@app/app.service';
import { ERSEvent } from '@models/ersEvent.model';
import { ERSRegistration, InvoicePaymentState, RegistrationStatus } from '@models/ersRegistration.model';
import { invoicePaymentStatusColor } from '../../invoicePayment.utils';
import { addIcons } from 'ionicons';
import { checkmarkOutline, chevronForward, closeOutline, walletOutline } from 'ionicons/icons';


@Component({
  selector: 'app-ers-registration',
  templateUrl: './ers-registration.component.html',
  styleUrls: ['./ers-registration.component.scss']
})
export class ERSRegistrationComponent implements OnChanges {
  @Input() registration: ERSRegistration | null;
  @Input() event: ERSEvent | null;
  @Input() row = false;
  @Input() header = false;
  @Input() selected = false;

  @Output() select = new EventEmitter<void>();
  @Output() toggleSelection = new EventEmitter<any>();
  @Output() approve = new EventEmitter<void>();
  @Output() reject = new EventEmitter<void>();
  @Output() confirmPayment = new EventEmitter<void>();

  RegistrationStatus = RegistrationStatus;
  invoicePaymentStatusColor = invoicePaymentStatusColor;
  /** Per-invoice payment state; empty until the registration is at a payment stage (approved or later). */
  invoicePayments: InvoicePaymentState[] = [];
  /** Whether any invoice applies at all, i.e. whether "not required" should be shown when there's nothing to list. */
  paymentRequired = false;

  constructor(public app: AppService) {
    addIcons({ checkmarkOutline, chevronForward, closeOutline, walletOutline }); }

  getUserName(): string {
    if (!this.registration?.subject) return '';
    return this.registration.subject.name || this.registration.userId;
  }

  getSpotName(): string {
    return this.event?.spots?.find(s => s.id === this.registration?.spotId)?.name || 'Unknown';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['event'] || changes['registration']) {
      const ready = !!this.event && !!this.registration;
      this.invoicePayments = ready ? this.registration.getInvoicePayments(this.event) : [];
      this.paymentRequired = ready && this.event.getApplicableInvoices(this.registration).length > 0;
    }
  }
}
