import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsModule } from '@idea-ionic/common';

import { ERSEventsService } from '../ers-events.service';
import { ERSRegistration, RegistrationStatus } from '@models/ersRegistration.model';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, IDEATranslationsModule],
  selector: 'app-edit-status',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar color="medium">
        <ion-buttons slot="start">
          <ion-button [title]="'COMMON.CANCEL' | translate" (click)="close()">
            <ion-icon slot="icon-only" icon="close-circle"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ 'ERS_EVENTS.EDIT_STATUS' | translate }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [title]="'COMMON.SAVE' | translate" (click)="save()">
            <ion-icon slot="icon-only" icon="checkmark-circle"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list class="aList" lines="full">
        <ion-list-header>
          <ion-label>
            <p>{{ 'ERS_EVENTS.EDIT_STATUS_I' | translate }}</p>
          </ion-label>
        </ion-list-header>
        <ion-radio-group [(ngModel)]="selectedStatus">
          <ion-item *ngFor="let s of statuses">
            <ion-radio slot="start" [value]="s.value"></ion-radio>
            <ion-label>{{ s.label | translate }}</ion-label>
          </ion-item>
        </ion-radio-group>
      </ion-list>
    </ion-content>
  `
})
export class EditStatusComponent implements OnInit {
  @Input() registration: ERSRegistration;

  selectedStatus: RegistrationStatus;

  statuses = [
    { value: RegistrationStatus.PENDING, label: 'ERS_EVENTS.STATUS_PENDING' },
    { value: RegistrationStatus.APPROVED, label: 'ERS_EVENTS.STATUS_APPROVED' },
    { value: RegistrationStatus.PAID, label: 'ERS_EVENTS.STATUS_PAID' },
    { value: RegistrationStatus.CONFIRMED, label: 'ERS_EVENTS.STATUS_CONFIRMED' },
    { value: RegistrationStatus.REJECTED, label: 'ERS_EVENTS.STATUS_REJECTED' }
  ];

  constructor(
    private modalCtrl: ModalController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private service: ERSEventsService
  ) { }

  ngOnInit(): void {
    this.selectedStatus = this.registration.status;
  }

  async save(): Promise<void> {
    if (this.selectedStatus === this.registration.status) return this.close();

    try {
      await this.loading.show();
      await this.service.setStatus(this.registration.eventId, this.registration.registrationId, this.selectedStatus);
      this.message.success('COMMON.OPERATION_COMPLETED');
      this.modalCtrl.dismiss({ status: this.selectedStatus });
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  close(): void {
    this.modalCtrl.dismiss();
  }
}
