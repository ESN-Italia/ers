import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsModule } from '@idea-ionic/common';

import { ERSEventsService } from '../ers-events.service';
import { ERSEvent } from '@models/ersEvent.model';
import { ERSRegistration } from '@models/ersRegistration.model';
import { addIcons } from 'ionicons';
import { checkmarkCircle, closeCircle } from 'ionicons/icons';


@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, IDEATranslationsModule],
  selector: 'app-edit-spot',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar color="medium">
        <ion-buttons slot="start">
          <ion-button [title]="'COMMON.CANCEL' | translate" (click)="close()">
            <ion-icon slot="icon-only" icon="close-circle"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ 'ERS_EVENTS.EDIT_SPOT' | translate }}</ion-title>
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
            <p>{{ 'ERS_EVENTS.EDIT_SPOT_I' | translate }}</p>
          </ion-label>
        </ion-list-header>
        <ion-radio-group [(ngModel)]="selectedSpotId">
          <ion-item *ngFor="let s of event?.spots">
            <ion-radio slot="start" [value]="s.id"></ion-radio>
            <ion-label>
              <h2>{{ s.name }}</h2>
              <p *ngIf="s.price">{{ s.price | currency:'EUR' }}</p>
            </ion-label>
          </ion-item>
        </ion-radio-group>
      </ion-list>
    </ion-content>
  `
})
export class EditSpotComponent implements OnInit {
  @Input() registration: ERSRegistration;
  @Input() event: ERSEvent;

  selectedSpotId: string;

  constructor(
    private modalCtrl: ModalController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private service: ERSEventsService
  ) {
    addIcons({ checkmarkCircle, closeCircle }); }

  ngOnInit(): void {
    this.selectedSpotId = this.registration.spotId;
  }

  async save(): Promise<void> {
    if (this.selectedSpotId === this.registration.spotId) return this.close();

    try {
      await this.loading.show();
      await this.service.setSpot(this.registration.eventId, this.registration.registrationId, this.selectedSpotId);
      this.message.success('COMMON.OPERATION_COMPLETED');
      this.modalCtrl.dismiss({ spotId: this.selectedSpotId });
    } catch (err: any) {
      this.message.error(err.message || 'COMMON.OPERATION_FAILED');
    } finally {
      await this.loading.hide();
    }
  }

  close(): void {
    this.modalCtrl.dismiss();
  }
}
