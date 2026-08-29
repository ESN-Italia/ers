import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { ERSEventsService } from '../ers-events.service';
import { ERSEvent, EventInvoice, EventQuestion, QuestionType } from '@models/ersEvent.model';
import { ERSRegistration } from '@models/ersRegistration.model';
import { Subject } from '@models/subject.model';
import { formatInTimeZone, zonedTimeToUtc } from 'date-fns-tz';
import { addIcons } from 'ionicons';
import { arrowBack, cloudUploadOutline, documentOutline, trashOutline } from 'ionicons/icons';
import { PrivacyPolicyComponent } from '@app/common/privacy-policy/privacy-policy.component';
import { MediaService } from '@common/media.service';


@Component({
  selector: 'app-registration-form',
  templateUrl: './registration-form.page.html',
  styleUrls: ['./registration-form.page.scss']
})
export class RegistrationFormPage implements OnInit {
  eventId: string;
  event: ERSEvent;
  registration: ERSRegistration;
  QuestionType = QuestionType;
  Genders = Genders;
  Pronouns = Pronouns;
  DocumentTypes = DocumentTypes;

  privacyPolicyAccepted = false;
  codeOfConductAccepted = false;
  errors = new Set<string>();
  now = new Date().toISOString();
  uploadingQuestionId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private t: IDEATranslationsService,
    private service: ERSEventsService,
    private mediaService: MediaService,
    public app: AppService
  ) {
    addIcons({ arrowBack, cloudUploadOutline, documentOutline, trashOutline });
  }

  async ngOnInit(): Promise<void> {
    this.eventId = this.route.snapshot.paramMap.get('eventId');
  }

  async ionViewWillEnter(): Promise<void> {
    await this.loadData();
  }
  async loadData(): Promise<void> {
    try {
      await this.loading.show();
      this.event = await this.service.getById(this.eventId);

      if (!this.event.isRegistrationOpen() && !this.event.canUserManage(this.app.user)) {
        return this.app.closePage('COMMON.UNAUTHORIZED');
      }

      const regs = await this.service.getRegistrations(this.eventId);
      const existing = regs.find(r => r.userId === this.app.user.userId);

      if (existing) {
        this.registration = existing;
        if (!this.registration.selectedOptionalTickets) this.registration.selectedOptionalTickets = [];
        if (!this.registration.selectedSectionName && this.registration.subject?.section) {
          this.registration.selectedSectionName = this.registration.subject.section;
        }
      } else {
        this.registration = new ERSRegistration({
          eventId: this.eventId,
          userId: this.app.user.userId,
          subject: Subject.fromUser(this.app.user),
          document: { type: '', number: '', issuedDate: '', issuedBy: '', validUntil: '' },
          specialAssistance: '',
          emergencyContact: { name: '', relationship: '', phone: '', spokenLanguages: '' },
          answers: {},
          selectedOptionalTickets: []
        });

        if (this.registration && this.registration.subject) {
          const hasAdditional = this.registration.subject.additionalSectionNames?.length > 0;

          if (hasAdditional) {
            this.registration.selectedSectionName = null;
          } else {
            this.registration.selectedSectionName = this.registration.subject.section;
          }
        }

        if (this.event.spots?.length === 1) {
          this.registration.spotId = this.event.spots[0].id;
        }
      }

      // Initialize missing answers as arrays for checkboxes
      this.event.questions?.forEach(q => {
        if (q.type === QuestionType.CHECKBOX && !Array.isArray(this.registration.answers[q.id])) {
          this.registration.answers[q.id] = this.registration.answers[q.id] ? (this.registration.answers[q.id] as string).split(',') : [];
        }
      });

    } catch (err) {
      return this.app.closePage('COMMON.NOT_FOUND');
    } finally {
      await this.loading.hide();
    }
  }

  async submit(): Promise<void> {
    // Validate
    this.errors = new Set(this.registration.validate(this.event));
    if (!this.privacyPolicyAccepted) this.errors.add('privacyPolicyAccepted');
    if (!this.codeOfConductAccepted) this.errors.add('codeOfConductAccepted');

    if (this.errors.size) {
      return this.message.error('COMMON.FORM_HAS_ERROR_TO_CHECK');
    }

    try {
      await this.loading.show();
      if (this.registration.registrationId) {
        await this.service.updateRegistration(this.registration);
      } else {
        await this.service.register(this.registration);
      }
      this.message.success('COMMON.OPERATION_COMPLETED');
      this.app.goToInTabs(['ers-events', this.eventId, 'registration'], { root: true }); // Go to details
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      await this.loading.hide();
    }
  }

  hasFieldAnError(field: string): boolean {
    return this.errors.has(field) || this.errors.has(field + ' > now') || this.errors.has(field + ' < now');
  }

  isCheckboxChecked(questionId: string, option: string): boolean {
    const answers = this.registration.answers[questionId];
    return Array.isArray(answers) && answers.includes(option);
  }

  toggleCheckbox(questionId: string, option: string): void {
    if (!Array.isArray(this.registration.answers[questionId])) {
      this.registration.answers[questionId] = [];
    }
    const answers = this.registration.answers[questionId] as string[];
    const index = answers.indexOf(option);
    if (index === -1) answers.push(option);
    else answers.splice(index, 1);
  }

  isOptionalTicketSelected(ticketId: string): boolean {
    return this.registration.selectedOptionalTickets?.includes(ticketId) || false;
  }

  toggleOptionalTicket(ticketId: string): void {
    if (!this.registration.selectedOptionalTickets) {
      this.registration.selectedOptionalTickets = [];
    }
    const index = this.registration.selectedOptionalTickets.indexOf(ticketId);
    if (index === -1) this.registration.selectedOptionalTickets.push(ticketId);
    else this.registration.selectedOptionalTickets.splice(index, 1);
  }

  getApplicableInvoices(): EventInvoice[] {
    if (!this.event || !this.registration) return [];
    return this.event.getApplicableInvoices(this.registration);
  }

  getInvoiceAmount(invoice: EventInvoice): number {
    return this.event.getInvoiceAmountForRegistration(invoice, this.registration);
  }

  getTotalPrice(): number {
    if (!this.event || !this.registration) return 0;
    return this.event
      .getInvoices()
      .reduce((sum, inv) => sum + this.event.getInvoiceAmountForRegistration(inv, this.registration), 0);
  }

  async openPrivacyPolicy(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: PrivacyPolicyComponent
    });
    await modal.present();
  }

  goBack(): void {
    this.app.goToInTabs(['ers-events', this.eventId]);
  }

  shouldShowQuestion(q: EventQuestion): boolean {
    const show = this.registration.shouldShowQuestion(q, this.event);
    if (!show && this.registration.answers[q.id] !== undefined) {
      delete this.registration.answers[q.id];
    }
    return show;
  }

  get hasVisibleQuestions(): boolean {
    return this.event?.questions?.some(q => this.shouldShowQuestion(q)) || false;
  }

  async onFileSelected(event: any, question: EventQuestion): Promise<void> {
    const file: File = event.target.files?.[0];
    if (!file) return;

    const maxMB = Math.min(question.maxFileSizeMB || 5, 50);
    const maxBytes = maxMB * 1024 * 1024;
    if (file.size > maxBytes) {
      this.message.error(this.t._('ERS_EVENTS.FILE_SIZE_EXCEEDED', { max: maxMB }));
      event.target.value = '';
      return;
    }

    try {
      this.uploadingQuestionId = question.id;
      const uploaded = await this.mediaService.uploadFile(file);
      this.registration.answers[question.id] = JSON.stringify({
        name: uploaded.name,
        url: uploaded.url,
        id: uploaded.id
      });
    } catch (err) {
      this.message.error(this.t._('COMMON.OPERATION_FAILED'));
    } finally {
      this.uploadingQuestionId = null;
      event.target.value = '';
    }
  }

  removeUploadedFile(questionId: string): void {
    delete this.registration.answers[questionId];
  }

  getUploadedFileName(answerValue: any): string {
    if (!answerValue) return '';
    try {
      if (typeof answerValue === 'string' && answerValue.startsWith('{')) {
        const parsed = JSON.parse(answerValue);
        return parsed.name || parsed.id || 'Uploaded Document';
      }
    } catch (e) { }
    return String(answerValue);
  }
}

export enum DocumentTypes {
  IDENTITY_CARD = 'IDENTITY_CARD',
  PASSPORT = 'PASSPORT',
  DRIVING_LICENSE = 'DRIVING_LICENSE',
  OTHER = 'OTHER'
}

export enum Pronouns {
  HE_HIM = 'HE_HIM',
  SHE_HER = 'SHE_HER',
  THEY_THEM = 'THEY_THEM'
}

export enum Genders {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER'
}
