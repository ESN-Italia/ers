import { Component, EventEmitter, Input, Output } from '@angular/core';

import { AppService } from '@app/app.service';
import { ERSEvent } from '@models/ersEvent.model';
import { ERSRegistration, RegistrationStatus } from '@models/ersRegistration.model';

@Component({
  selector: 'app-ers-registration',
  templateUrl: './ers-registration.component.html',
  styleUrls: ['./ers-registration.component.scss']
})
export class ERSRegistrationComponent {
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

  constructor(public app: AppService) { }

  getUserName(): string {
    if (!this.registration?.subject) return '';
    return this.registration.subject.name || this.registration.userId;
  }

  getSpotName(): string {
    return this.event?.spots?.find(s => s.id === this.registration?.spotId)?.name || 'Unknown';
  }
}
