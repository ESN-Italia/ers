import { epochISOString, Resource } from 'idea-toolbox';

import { ERSEvent } from './ersEvent.model';
import { Subject } from './subject.model';
import { isValidPhone } from './utils';

export enum RegistrationStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED", // Spot assigned, waiting payment
  PAID = "PAID", // Paid, waiting confirmation
  CONFIRMED = "CONFIRMED", // Confirmed
  REJECTED = "REJECTED"
}

export class ProofOfPayment extends Resource {
  key: string;
  uploadedAt: epochISOString;

  load(x: any): void {
    super.load(x);
    this.key = this.clean(x.key, String);
    this.uploadedAt = this.clean(x.uploadedAt, d => new Date(d).toISOString());
  }
}

export class ERSRegistration extends Resource {
  eventId: string;
  registrationId: string;
  userId: string;
  subject: Subject;
  phone: string;
  document: {
    type: string;
    number: string;
    issuedDate: string;
    issuedBy: string;
    validUntil: string;
  };
  esnCardNumber: string;
  homeAddress: string;
  foodAllergies?: string;
  specialAssistance?: string;
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
    spokenLanguages: string;
  };
  spotId: string;
  selectedSectionName: string;
  selectedOptionalTickets: string[];
  answers: { [questionId: string]: string | string[] };
  status: RegistrationStatus;
  proofOfPayment?: ProofOfPayment;
  invoiceNumber?: number;
  approvedAt?: epochISOString;
  createdAt: epochISOString;
  updatedAt?: epochISOString;

  load(x: any): void {
    super.load(x);
    this.eventId = this.clean(x.eventId, String);
    this.registrationId = this.clean(x.registrationId, String);
    this.userId = this.clean(x.userId, String);
    this.subject = this.clean(x.subject, s => new Subject(s));
    this.selectedSectionName = this.clean(x.selectedSectionName, String);

    this.document = this.clean(x.document, Object, {
      type: '',
      number: '',
      issuedDate: '',
      issuedBy: '',
      validUntil: ''
    });
    this.esnCardNumber = this.clean(x.esnCardNumber, String);
    this.homeAddress = this.clean(x.homeAddress, String);
    this.foodAllergies = this.clean(x.foodAllergies, String);
    this.specialAssistance = this.clean(x.specialAssistance, String);
    this.emergencyContact = this.clean(x.emergencyContact, Object, {
      name: '',
      relationship: '',
      phone: '',
      spokenLanguages: ''
    });

    this.spotId = this.clean(x.spotId, String);
    this.selectedOptionalTickets = this.cleanArray(x.selectedOptionalTickets, String);
    this.answers = this.clean(x.answers, Object, {});
    this.status = this.clean(x.status, String, RegistrationStatus.PENDING) as RegistrationStatus;
    this.proofOfPayment = this.clean(x.proofOfPayment || x.receipt, r => new ProofOfPayment(r));
    if (x.invoiceNumber !== undefined) this.invoiceNumber = this.clean(x.invoiceNumber, Number);
    if (x.approvedAt) this.approvedAt = this.clean(x.approvedAt, d => new Date(d).toISOString());
    this.createdAt = this.clean(x.createdAt, d => new Date(d).toISOString(), new Date().toISOString());
    if (x.updatedAt) this.updatedAt = this.clean(x.updatedAt, d => new Date(d).toISOString());
    if (!this.selectedOptionalTickets) this.selectedOptionalTickets = [];
  }

  safeLoad(newData: any, safeData: any): void {
    super.safeLoad(newData, safeData);
    this.eventId = safeData.eventId;
    this.registrationId = safeData.registrationId;
    this.userId = safeData.userId;
    this.createdAt = safeData.createdAt;
    this.status = safeData.status;
    this.subject.id = safeData.subject.id;
    this.subject.type = safeData.subject.type;
    this.subject.name = safeData.subject.name;

    if (safeData.proofOfPayment) this.proofOfPayment = safeData.proofOfPayment;
    if (safeData.invoiceNumber !== undefined) this.invoiceNumber = safeData.invoiceNumber;
    if (safeData.approvedAt) this.approvedAt = safeData.approvedAt
    if (safeData.updatedAt) this.updatedAt = safeData.updatedAt;
  }

  validate(event?: ERSEvent): string[] {
    const e = super.validate();
    if (this.iE(this.eventId)) e.push('eventId');
    if (this.iE(this.userId)) e.push('userId');
    if (!this.subject) e.push('subject');
    else e.push(...this.subject.validate().map(f => `subject.${f}`));

    if (this.iE(this.document?.type)) e.push('document.type');
    if (this.iE(this.document?.number)) e.push('document.number');
    if (this.iE(this.document?.issuedDate)) e.push('document.issuedDate');
    if (this.iE(this.document?.issuedBy)) e.push('document.issuedBy');
    if (this.iE(this.document?.validUntil)) e.push('document.validUntil');

    const now = new Date().toISOString();
    if (this.document?.issuedDate && this.document.issuedDate > now) e.push('document.issuedDate > now');
    if (this.document?.validUntil && this.document.validUntil < now) e.push('document.validUntil < now');
    if (this.iE(this.esnCardNumber)) e.push('esnCardNumber');
    if (this.iE(this.homeAddress)) e.push('homeAddress');
    if (this.iE(this.emergencyContact?.name)) e.push('emergencyContact.name');
    if (this.iE(this.emergencyContact?.relationship)) e.push('emergencyContact.relationship');
    if (this.iE(this.emergencyContact?.phone) || !isValidPhone(this.emergencyContact?.phone)) e.push('emergencyContact.phone');
    if (this.iE(this.emergencyContact?.spokenLanguages)) e.push('emergencyContact.spokenLanguages');
    if (this.iE(this.spotId)) e.push('spotId');
    if (this.iE(this.selectedSectionName)) e.push('selectedSectionName');

    if (event) {
      // Validate Spot
      const spot = event.spots?.find(s => s.id === this.spotId);
      if (!spot) e.push('invalid spotId');

      // Validate Optional Tickets
      if (this.selectedOptionalTickets && this.selectedOptionalTickets.length) {
        for (const ticketId of this.selectedOptionalTickets) {
          if (!event.optionalTickets?.find(t => t.id === ticketId)) {
            e.push(`invalid optional ticket: ${ticketId}`);
          }
        }
      }

      // Validate Answers
      event.questions?.forEach(q => {
        if (this.shouldShowQuestion(q, event) && q.required && this.iE(this.answers[q.id])) {
          e.push(`answers[${q.id}] required`);
        }
      });
    }

    return e;
  }

  shouldShowQuestion(q: any, event: ERSEvent): boolean {
    if (q.spotIdCondition && this.spotId !== q.spotIdCondition) return false;
    if (q.optionalTicketIdCondition && !this.selectedOptionalTickets?.includes(q.optionalTicketIdCondition)) return false;
    if (q.dependsOnQuestionId) {
      const parentAnswer = this.answers[q.dependsOnQuestionId];
      if (Array.isArray(parentAnswer)) {
        if (!parentAnswer.includes(q.dependsOnAnswer)) return false;
      } else if (parentAnswer !== q.dependsOnAnswer) {
        return false;
      }
    }
    return true;
  }
}
