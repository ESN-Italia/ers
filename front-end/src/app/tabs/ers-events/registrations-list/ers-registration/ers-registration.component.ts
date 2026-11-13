import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

import { AppService } from '@app/app.service';
import { ERSEvent, EventInvoice } from '@models/ersEvent.model';
import { ERSRegistration, RegistrationStatus } from '@models/ersRegistration.model';
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
  applicableInvoices: EventInvoice[] = [];

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
      this.applicableInvoices =
        this.event && this.registration ? this.event.getApplicableInvoices(this.registration) : [];
    }
  }

  hasProofOfPayment(invoiceId: string): boolean {
    return !!this.registration?.payments?.[invoiceId]?.proofOfPayment?.key;
  }
}
