import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { ERSEventsService } from '../ers-events.service';
import { ERSEvent } from '@models/ersEvent.model';
import { ERSRegistration, RegistrationStatus } from '@models/ersRegistration.model';

@Component({
  selector: 'app-registration-detail',
  templateUrl: './registration-detail.page.html',
  styleUrls: ['./registration-detail.page.scss']
})
export class RegistrationDetailPage implements OnInit {
  eventId: string;
  registrationId: string;
  // Actually, I can search for my registration.

  event: ERSEvent;
  registration: ERSRegistration;
  RegistrationStatus = RegistrationStatus;

  constructor(
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private t: IDEATranslationsService,
    private service: ERSEventsService,
    public app: AppService
  ) { }

  async ngOnInit(): Promise<void> {
    this.eventId = this.route.snapshot.paramMap.get('eventId');
    this.registrationId = this.route.snapshot.paramMap.get('registrationId');
  }

  async ionViewWillEnter(): Promise<void> {
    await this.loadData();
  }

  async loadData(showLoading = true): Promise<void> {
    try {
      if (showLoading) await this.loading.show();
      this.event = await this.service.getById(this.eventId);

      if (this.registrationId) {
        this.registration = await this.service.getRegistration(this.eventId, this.registrationId);
      } else {
        const regs = await this.service.getRegistrations(this.eventId);
        this.registration = regs.find(r => r.userId === this.app.user.userId);
      }

      if (!this.registration) {
        this.message.error('COMMON.NOT_FOUND');
        this.app.closePage(); // Go back
      }
    } catch (err) {
      this.message.error('COMMON.NOT_FOUND');
    } finally {
      if (showLoading) this.loading.hide();
    }
  }

  async uploadReceipt(event: any): Promise<void> {
    const file = event.target.files[0];
    if (!file) return;

    try {
      await this.loading.show();
      // Get presigned URL
      const extension = file.name.split('.').pop();
      const signedUrl: any = await this.service.getReceiptUploadUrl(this.eventId, this.registration.registrationId, extension);

      // Upload
      const response = await fetch(signedUrl.url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      if (!response.ok) throw new Error('Upload failed');

      // Notify backend
      await this.service.submitReceipt(this.eventId, this.registration.registrationId, signedUrl.key);

      this.message.success('COMMON.OPERATION_COMPLETED');
      await this.loadData(false); // reload status
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  async deleteReceipt(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'COMMON.ARE_YOU_SURE',
      buttons: [
        { text: 'COMMON.CANCEL', role: 'cancel' },
        {
          text: 'COMMON.CONFIRM',
          handler: async () => {
            try {
              await this.loading.show();
              await this.service.deleteReceipt(this.eventId, this.registration.registrationId);
              await this.loadData(false);
              this.message.success('COMMON.OPERATION_COMPLETED');
            } catch (err) {
              this.message.error('COMMON.OPERATION_FAILED');
            } finally {
              this.loading.hide();
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async viewReceipt(): Promise<void> {
    try {
      await this.loading.show();
      const signedUrl = await this.service.getReceiptDownloadUrl(this.eventId, this.registration.registrationId);
      window.open(signedUrl.url, '_blank');
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  getSpotName(): string {
    return this.event?.spots?.find(s => s.id === this.registration?.spotId)?.name || 'Unknown Spot';
  }

  isMyRegistration(): boolean {
    return this.registration?.userId === this.app.user.userId;
  }

  async modify(): Promise<void> {
    this.app.goToInTabs(['ers-events', this.eventId, 'register']);
  }

  async approve(): Promise<void> {
    try {
      await this.loading.show();
      await this.service.approveSpot(this.eventId, this.registration.registrationId);
      await this.loadData(false);
      this.message.success('COMMON.OPERATION_COMPLETED');
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  async reject(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'COMMON.ARE_YOU_SURE',
      buttons: [
        { text: 'COMMON.CANCEL', role: 'cancel' },
        {
          text: 'COMMON.CONFIRM',
          handler: async () => {
            try {
              await this.loading.show();
              await this.service.rejectSpot(this.eventId, this.registration.registrationId);
              await this.loadData(false);
              this.message.success('COMMON.OPERATION_COMPLETED');
            } catch (err) {
              this.message.error('COMMON.OPERATION_FAILED');
            } finally {
              this.loading.hide();
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async confirmPayment(): Promise<void> {
    try {
      await this.loading.show();
      await this.service.confirmPayment(this.eventId, this.registration.registrationId);
      await this.loadData(false);
      this.message.success('COMMON.OPERATION_COMPLETED');
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  async withdraw(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'ERS_EVENTS.WITHDRAW_REGISTRATION',
      message: 'ERS_EVENTS.WITHDRAW_REGISTRATION_CONFIRM',
      buttons: [
        { text: 'COMMON.CANCEL', role: 'cancel' },
        {
          text: 'COMMON.CONFIRM',
          handler: async () => {
            try {
              await this.loading.show();
              await this.service.deleteRegistration(this.eventId, this.registration.registrationId);
              this.message.success('COMMON.OPERATION_COMPLETED');
              this.app.closePage();
            } catch (err) {
              this.message.error('COMMON.OPERATION_FAILED');
            } finally {
              this.loading.hide();
            }
          }
        }
      ]
    });
    await alert.present();
  }

  formatAnswer(questionId: string): string {
    const answer = this.registration?.answers?.[questionId];
    if (Array.isArray(answer)) return answer.join(', ');
    return (answer as string) || '-';
  }
}
