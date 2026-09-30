import { epochISOString, Resource } from 'idea-toolbox';

import { ERSEvent, DEFAULT_INVOICE_ID } from './ersEvent.model';
import { Subject } from './subject.model';
import { isValidPhone } from './utils';

export enum RegistrationStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED", // Spot assigned, waiting payment
  PAID = "PAID", // Paid, waiting confirmation
  CONFIRMED = "CONFIRMED", // Confirmed
  REJECTED = "REJECTED"
}

/**
 * The ESN Italia privacy policy the data consent links to (as given in issue #38).
 */
export const DATA_CONSENT_PRIVACY_POLICY_URL =
  'https://docs.google.com/document/d/1TEt4ks86SamK7_mmxJyqTsegw8rzn6DJ/edit?usp=drive_link&ouid=110153794008465365517&rtpof=true&sd=true';

/**
 * The ESN Italia consent to the processing of personal data, required to register. Kept verbatim from legal counsel
 * (issue #38): do not reword it here. It ends where the link to `DATA_CONSENT_PRIVACY_POLICY_URL` is rendered.
 */
export const DATA_CONSENT_TEXT =
  'I consent to the processing of my personal data provided through this questionnaire, pursuant to Regulation ' +
  '(EU) 2016/679 – General Data Protection Regulation (GDPR). I have read the privacy policy on the processing of ' +
  'personal data available at the following';

/**
 * The ESN Italia photo/video authorization asked on every registration. Kept verbatim from legal counsel (issue #38):
 * do not reword it here.
 */
export const PHOTO_VIDEO_CONSENT_TEXT =
  'I authorize, free of charge and without time limits, pursuant to Articles 10 and 320 of the Civil Code, ' +
  'Articles 96 and 97 of Law no. 633 of 22 April 1941 (Copyright Law), and Article 6(1)(a) of EU Regulation ' +
  "2016/679, the use, publication and/or distribution in any form of my own images on the Controller's " +
  'website, in print, or in documents, brochures and pamphlets intended for distribution outside the Controller ' +
  'for informational purposes and/or any type of medium, digital and/or paper, as well as in the digital ' +
  'archives of Erasmus Student Network Italia – ESN Italia - ETS, and I acknowledge that the purpose of such ' +
  'publications is merely informational and possibly promotional in nature.\n' +
  'This release/authorization may be revoked at any time by written communication to be sent by ordinary mail ' +
  'or e-mail to the address: info@esn.it; amministrazione@esn.it';

export class ProofOfPayment extends Resource {
  key: string;
  uploadedAt: epochISOString;

  load(x: any): void {
    super.load(x);
    this.key = this.clean(x.key, String);
    this.uploadedAt = this.clean(x.uploadedAt, d => new Date(d).toISOString());
  }
}

/**
 * The payment status of a single invoice within a registration.
 */
export enum InvoicePaymentStatus {
  PENDING = 'PENDING', // awaiting the participant's proof of payment
  PAID = 'PAID', // proof uploaded, awaiting a manager's confirmation
  CONFIRMED = 'CONFIRMED' // a manager confirmed the payment for this invoice
}

/**
 * A registration's payment state for one event invoice. Each applicable invoice gets its own entry
 * (with its own invoice number, proof of payment and confirmation), so different administrators can
 * confirm different invoices independently.
 */
export class InvoicePayment extends Resource {
  invoiceId: string;
  invoiceNumber?: number;
  status: InvoicePaymentStatus;
  proofOfPayment?: ProofOfPayment;
  confirmedAt?: epochISOString;

  load(x: any): void {
    super.load(x);
    this.invoiceId = this.clean(x.invoiceId, String);
    if (x.invoiceNumber !== undefined) this.invoiceNumber = this.clean(x.invoiceNumber, Number);
    this.status = this.clean(x.status, String, InvoicePaymentStatus.PENDING) as InvoicePaymentStatus;
    this.proofOfPayment = this.clean(x.proofOfPayment, r => new ProofOfPayment(r));
    if (x.confirmedAt) this.confirmedAt = this.clean(x.confirmedAt, d => new Date(d).toISOString());
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
  /**
   * Authorization to use the participant's photos and videos (see `PHOTO_VIDEO_CONSENT_TEXT`). It must be answered to
   * register, but either answer is accepted: refusing it doesn't stand in the way of taking part. `null` means it was
   * never answered (e.g. registrations created before it was asked), which is distinct from a refusal (`false`).
   */
  photoVideoConsent: boolean | null;
  status: RegistrationStatus;
  /**
   * @deprecated Superseded by the per-invoice `payments` map; kept for backward compatibility and to
   * synthesize the default-invoice payment for registrations created before the multi-invoice feature.
   */
  proofOfPayment?: ProofOfPayment;
  /**
   * @deprecated Superseded by `payments[invoiceId].invoiceNumber`.
   */
  invoiceNumber?: number;
  /**
   * Per-invoice payment state, keyed by invoiceId. Populated on approval; server-owned (locked in safeLoad).
   */
  payments: { [invoiceId: string]: InvoicePayment };
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
    // Anything but a real boolean (e.g. the string "false") must not be read as a consent: it stays unanswered.
    this.photoVideoConsent = x.photoVideoConsent === true || x.photoVideoConsent === false ? x.photoVideoConsent : null;
    this.status = this.clean(x.status, String, RegistrationStatus.PENDING) as RegistrationStatus;
    this.proofOfPayment = this.clean(x.proofOfPayment || x.receipt, r => new ProofOfPayment(r));
    if (x.invoiceNumber !== undefined) this.invoiceNumber = this.clean(x.invoiceNumber, Number);
    if (x.approvedAt) this.approvedAt = this.clean(x.approvedAt, d => new Date(d).toISOString());

    // Multi-invoice payments map; cast each entry to InvoicePayment.
    this.payments = {};
    const rawPayments = this.clean(x.payments, Object, {});
    for (const invoiceId of Object.keys(rawPayments)) {
      this.payments[invoiceId] = new InvoicePayment(rawPayments[invoiceId]);
    }
    // Backward compatibility: map a legacy single proof/invoiceNumber onto the synthesized default invoice.
    if (!Object.keys(this.payments).length && (this.proofOfPayment || this.invoiceNumber !== undefined)) {
      let legacyStatus = InvoicePaymentStatus.PENDING;
      if (this.status === RegistrationStatus.CONFIRMED) legacyStatus = InvoicePaymentStatus.CONFIRMED;
      else if (this.status === RegistrationStatus.PAID || this.proofOfPayment) legacyStatus = InvoicePaymentStatus.PAID;
      this.payments[DEFAULT_INVOICE_ID] = new InvoicePayment({
        invoiceId: DEFAULT_INVOICE_ID,
        invoiceNumber: this.invoiceNumber,
        status: legacyStatus,
        proofOfPayment: this.proofOfPayment,
        confirmedAt: this.status === RegistrationStatus.CONFIRMED ? this.approvedAt : undefined
      });
    }
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
    // Payments are server-owned (invoice numbers, proofs, confirmations): a client PUT can never set them.
    if (safeData.payments) this.payments = safeData.payments;
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
    if (this.photoVideoConsent !== true && this.photoVideoConsent !== false) e.push('photoVideoConsent');

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
