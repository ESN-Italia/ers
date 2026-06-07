import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { ERSEventsService } from '../ers-events.service';
import { PrivacyPolicyComponent } from './privacy-policy.component';
import { ERSEvent, EventQuestion, QuestionType } from '@models/ersEvent.model';
import { ERSRegistration } from '@models/ersRegistration.model';
import { Subject } from '@models/subject.model';
import { formatInTimeZone, zonedTimeToUtc } from 'date-fns-tz';
import { addIcons } from 'ionicons';
import { arrowBack } from 'ionicons/icons';


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

  constructor(
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private service: ERSEventsService,
    public app: AppService
  ) {
    addIcons({ arrowBack });
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
          selectedSectionName: this.app.user.section,
          document: { type: '', number: '', issuedDate: '', issuedBy: '', validUntil: '' },
          specialAssistance: '',
          emergencyContact: { name: '', relationship: '', phone: '', spokenLanguages: '' },
          answers: {},
          selectedOptionalTickets: []
        });
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
      this.message.error('COMMON.NOT_FOUND');
    } finally {
      this.loading.hide();
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
      this.loading.hide();
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

  getTotalPrice(): number {
    let total = 0;
    if (this.registration.spotId) {
      const spot = this.event.spots?.find(s => s.id === this.registration.spotId);
      if (spot && spot.price) total += spot.price;
    }
    if (this.registration.selectedOptionalTickets && this.registration.selectedOptionalTickets.length) {
      for (const ticketId of this.registration.selectedOptionalTickets) {
        const ticket = this.event.optionalTickets?.find(t => t.id === ticketId);
        if (ticket && ticket.price) total += ticket.price;
      }
    }
    return total;
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
