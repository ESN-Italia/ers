import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, ModalController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { ERSEventsService } from '../ers-events.service';
import { EditStatusComponent } from './edit-status.component';
import { ERSEvent, QuestionType } from '@models/ersEvent.model';
import { ERSRegistration, RegistrationStatus } from '@models/ersRegistration.model';
import { formatInTimeZone } from 'date-fns-tz';

import * as pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
(pdfMake as any).vfs = pdfFonts && (pdfFonts as any).pdfMake ? (pdfFonts as any).pdfMake.vfs : (pdfFonts as any).vfs;

import htmlToPdfmake from 'html-to-pdfmake';

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
    private modalCtrl: ModalController,
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

  async uploadProofOfPayment(event: any): Promise<void> {
    const file = event.target.files[0];
    if (!file) return;

    try {
      await this.loading.show();
      // Get presigned URL
      const extension = file.name.split('.').pop();
      const signedUrl: any = await this.service.getProofOfPaymentUploadUrl(this.eventId, this.registration.registrationId, extension);

      // Upload
      const response = await fetch(signedUrl.url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      if (!response.ok) throw new Error('Upload failed');

      // Notify backend
      await this.service.submitProofOfPayment(this.eventId, this.registration.registrationId, signedUrl.key);

      this.message.success('COMMON.OPERATION_COMPLETED');
      await this.loadData(false); // reload status
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  async deleteProofOfPayment(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: this.t._('COMMON.ARE_YOU_SURE'),
      buttons: [
        { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
        {
          text: this.t._('COMMON.CONFIRM'),
          handler: async () => {
            try {
              await this.loading.show();
              await this.service.deleteProofOfPayment(this.eventId, this.registration.registrationId);
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

  async viewProofOfPayment(): Promise<void> {
    try {
      await this.loading.show();
      const signedUrl = await this.service.getProofOfPaymentDownloadUrl(this.eventId, this.registration.registrationId);
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

  getOptionalTicketsNames(): string {
    if (!this.registration?.selectedOptionalTickets?.length) return '-';
    return this.registration.selectedOptionalTickets
      .map(id => this.event?.optionalTickets?.find(t => t.id === id)?.name || 'Unknown Ticket')
      .join(', ');
  }

  getTotalPrice(): number {
    let total = 0;
    if (this.registration?.spotId) {
      const spot = this.event?.spots?.find(s => s.id === this.registration.spotId);
      if (spot && spot.price) total += spot.price;
    }
    if (this.registration?.selectedOptionalTickets?.length) {
      for (const ticketId of this.registration.selectedOptionalTickets) {
        const ticket = this.event?.optionalTickets?.find(t => t.id === ticketId);
        if (ticket && ticket.price) total += ticket.price;
      }
    }
    return total;
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
      header: this.t._('COMMON.ARE_YOU_SURE'),
      buttons: [
        { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
        {
          text: this.t._('COMMON.CONFIRM'),
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
      header: this.t._('ERS_EVENTS.WITHDRAW_REGISTRATION'),
      message: this.t._('ERS_EVENTS.WITHDRAW_REGISTRATION_CONFIRM'),
      buttons: [
        { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
        {
          text: this.t._('COMMON.CONFIRM'),
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

  async editStatus(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: EditStatusComponent,
      componentProps: { registration: this.registration }
    });
    modal.onDidDismiss().then(async ({ data }) => {
      if (data?.status) await this.loadData(false);
    });
    await modal.present();
  }

  goBack(): void {
    if (this.registrationId) {
      this.app.goToInTabs(['ers-events', this.eventId, 'registrations']);
    } else {
      this.app.goToInTabs(['ers-events', this.eventId]);
    }
  }

  getRegistrationDate(): string {
    return formatInTimeZone(this.registration.createdAt, this.event.timezone, 'yyyy-MM-dd HH:mm:ss');
  }

  formatAnswer(questionId: string): string {
    const answer = this.registration?.answers?.[questionId];
    if (Array.isArray(answer)) return answer.join(', ');
    if (answer && this.event?.questions?.find(q => q.id === questionId)?.type === QuestionType.DATE) {
      const d = new Date(answer as string);
      if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
    }
    if (answer && this.event?.questions?.find(q => q.id === questionId)?.type === QuestionType.TIME) {
      const d = new Date(answer as string);
      if (!isNaN(d.getTime())) return formatInTimeZone(answer as string, this.event.timezone, 'HH:mm');
    }
    return (answer as string) || '-';
  }

  shouldShowQuestion(q: any): boolean {
    if (!this.registration || !this.event) return false;
    return this.registration.shouldShowQuestion(q, this.event);
  }

  async downloadInvoice(): Promise<void> {
    if (!this.registration || !this.registration.invoiceNumber) return;

    let iconImage = null;
    let isSvg = false;
    const iconUrl = this.app.getIcon(false);
    if (iconUrl) {
      try {
        const response = await fetch(iconUrl);
        if (response.ok) {
          if (iconUrl.toLowerCase().endsWith('.svg') || response.headers.get('content-type')?.includes('svg')) {
            iconImage = await response.text();
            isSvg = true;
          } else {
            const blob = await response.blob();
            iconImage = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
          }
        }
      } catch (e) {
        console.warn('Could not load icon for PDF', e);
      }
    }

    const cleanName = (this.registration.subject?.name || '').replace(/[^a-zA-Z0-9 ]/g, '');
    const cleanEventName = (this.event?.name || '').replace(/[^a-zA-Z0-9 ]/g, '');
    const bankTransferReason = `${cleanName} ${this.registration.invoiceNumber} ${cleanEventName}`;

    const docDefinition: any = {
      content: [
        { text: 'Event invoice', style: 'header', margin: [0, 0, 0, 5] },
        { text: this.event?.name, style: 'subtitle', margin: [0, 0, 0, 20] },
        {
          columns: [
            {
              width: '*',
              text: [
                { text: `${this.registration.subject.name}\n`, bold: true, fontSize: 13 },
                { text: `${this.registration.homeAddress}\n`, color: '#555555' },
                { text: `${this.registration.subject.email}\n`, color: '#555555' },
                { text: `${this.registration.phone}`, color: '#555555' }
              ]
            },
            {
              width: 'auto',
              alignment: 'right',
              text: [
                { text: `Invoice number: ${this.registration.invoiceNumber}\n` },
                { text: `Date: ${new Date(this.registration.approvedAt || new Date()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}\n` }
              ]
            }
          ],
          margin: [0, 0, 0, 20]
        },
        this.createSectionHeader('Details', '#00aeef'),
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto'],
            body: [
              [{ text: 'Description', bold: true }, { text: 'Price', bold: true }],
              ...this.getInvoiceTableBody()
            ]
          },
          layout: 'lightHorizontalLines'
        },
        { text: `Total: ${this.getTotalPrice().toFixed(2)} €`, style: 'totals' },
        { text: '\n' },
        ...(this.event.invoiceDueDate ? [
          this.createSectionHeader('Due Date', '#ec008c'),
          { text: `${new Date(this.event.invoiceDueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}\n`, bold: true, color: 'black', alignment: 'center' },
          { text: '\n' }
        ] : []),
        this.createSectionHeader('Payment Information', '#f47b20'),
        htmlToPdfmake(this.event?.paymentInfo || ''),
        { text: '\n' },
        this.createSectionHeader('Bank Transfer Reason', '#7ac143'),
        { text: bankTransferReason, bold: true, fontSize: 14 }
      ],
      styles: {
        header: { fontSize: 24, bold: true, color: 'black' },
        subtitle: { fontSize: 16, color: '#555555' },
        totals: { fontSize: 16, bold: true, alignment: 'right', margin: [0, 20, 0, 0] }
      }
    };

    pdfMake.createPdf(docDefinition).download(`Invoice_${this.registration.invoiceNumber}_${cleanEventName.replace(/ /g, '_')}.pdf`);
  }

  private createSectionHeader(title: string, color: string): any {
    return {
      table: {
        widths: ['*'],
        body: [
          [{ text: title, alignment: 'center', bold: true, fontSize: 14, color: color, margin: [0, 6, 0, 6], border: [true, true, true, true] }]
        ]
      },
      layout: {
        hLineColor: () => color,
        vLineColor: () => color,
      },
      margin: [0, 10, 0, 10]
    };
  }

  private getInvoiceTableBody(): any[] {
    const tableBody = [];
    const spot = this.event?.spots?.find(s => s.id === this.registration.spotId);
    if (spot) {
      tableBody.push([`Spot: ${spot.name}`, `${spot.price.toFixed(2)} €`]);
    }

    if (this.registration.selectedOptionalTickets?.length) {
      for (const ticketId of this.registration.selectedOptionalTickets) {
        const ticket = this.event?.optionalTickets?.find(t => t.id === ticketId);
        if (ticket) {
          const desc = ticket.description ? ` (${ticket.description})` : '';
          tableBody.push([`Ticket: ${ticket.name}${desc}`, `${ticket.price.toFixed(2)} €`]);
        }
      }
    }
    return tableBody;
  }
}
