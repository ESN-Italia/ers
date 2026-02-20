import { epochISOString, Resource } from 'idea-toolbox';

import { ERSEvent } from './ersEvent.model';
import { User } from './user.model';

export enum RegistrationStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED", // Spot assigned, waiting payment
  PAID = "PAID", // Paid, waiting confirmation
  CONFIRMED = "CONFIRMED", // Confirmed
  REJECTED = "REJECTED"
}

export class Receipt extends Resource {
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
  email: string;
  firstName: string;
  lastName: string;
  sectionCode: string;
  section: string;
  country: string;
  phone: string;
  identityCard: {
    number: string;
    issuedDate: string;
    issuedBy: string;
    validUntil: string;
  };
  esnCardNumber: string;
  homeAddress: string;
  foodAllergies: string;
  emergencyContact: {
    name: string;
    phone: string;
    spokenLanguages: string;
  };
  spotId: string;
  answers: { [questionId: string]: string | string[] };
  status: RegistrationStatus;
  receipt?: Receipt;
  createdAt: epochISOString;
  updatedAt?: epochISOString;

  load(x: any): void {
    super.load(x);
    this.eventId = this.clean(x.eventId, String);
    this.registrationId = this.clean(x.registrationId, String);
    this.userId = this.clean(x.userId, String);
    this.email = this.clean(x.email, String);
    this.firstName = this.clean(x.firstName, String);
    this.lastName = this.clean(x.lastName, String);
    this.sectionCode = this.clean(x.sectionCode, String);
    this.section = this.clean(x.section, String);
    this.country = this.clean(x.country, String);
    this.phone = this.clean(x.phone, String);
    this.identityCard = this.clean(x.identityCard, Object, {
      number: '',
      issuedDate: '',
      issuedBy: '',
      validUntil: ''
    });
    this.esnCardNumber = this.clean(x.esnCardNumber, String);
    this.homeAddress = this.clean(x.homeAddress, String);
    this.foodAllergies = this.clean(x.foodAllergies, String);
    this.emergencyContact = this.clean(x.emergencyContact, Object, {
      name: '',
      phone: '',
      spokenLanguages: ''
    });

    this.spotId = this.clean(x.spotId, String);
    this.answers = this.clean(x.answers, Object, {});
    this.status = this.clean(x.status, String, RegistrationStatus.PENDING) as RegistrationStatus;
    this.receipt = this.clean(x.receipt, r => new Receipt(r));
    this.createdAt = this.clean(x.createdAt, d => new Date(d).toISOString(), new Date().toISOString());
    if (x.updatedAt) this.updatedAt = this.clean(x.updatedAt, d => new Date(d).toISOString());
  }

  safeLoad(newData: any, safeData: any): void {
    super.safeLoad(newData, safeData);
    this.eventId = safeData.eventId;
    this.registrationId = safeData.registrationId;
    this.userId = safeData.userId;
    this.createdAt = safeData.createdAt;
    this.status = safeData.status;

    this.email = newData.email || safeData.email;
    this.phone = newData.phone || safeData.phone;
    this.identityCard = newData.identityCard || safeData.identityCard;
    this.esnCardNumber = newData.esnCardNumber || safeData.esnCardNumber;
    this.homeAddress = newData.homeAddress || safeData.homeAddress;
    this.foodAllergies = newData.foodAllergies || safeData.foodAllergies;
    this.emergencyContact = newData.emergencyContact || safeData.emergencyContact;

    if (safeData.receipt) this.receipt = safeData.receipt;
    if (safeData.updatedAt) this.updatedAt = safeData.updatedAt;
  }

  validate(event?: ERSEvent): string[] {
    const e = super.validate();
    if (this.iE(this.eventId)) e.push('eventId');
    if (this.iE(this.userId)) e.push('userId');
    if (this.iE(this.email)) e.push('email');
    if (this.iE(this.phone)) e.push('phone');
    if (this.iE(this.identityCard?.number)) e.push('identityCard.number');
    if (this.iE(this.identityCard?.issuedDate)) e.push('identityCard.issuedDate');
    if (this.iE(this.identityCard?.issuedBy)) e.push('identityCard.issuedBy');
    if (this.iE(this.identityCard?.validUntil)) e.push('identityCard.validUntil');
    if (this.iE(this.esnCardNumber)) e.push('esnCardNumber');
    if (this.iE(this.homeAddress)) e.push('homeAddress');
    if (this.iE(this.foodAllergies)) e.push('foodAllergies');
    if (this.iE(this.emergencyContact?.name)) e.push('emergencyContact.name');
    if (this.iE(this.emergencyContact?.phone)) e.push('emergencyContact.phone');
    if (this.iE(this.emergencyContact?.spokenLanguages)) e.push('emergencyContact.spokenLanguages');
    if (this.iE(this.spotId)) e.push('spotId');

    if (event) {
      // Validate Spot
      const spot = event.spots?.find(s => s.id === this.spotId);
      if (!spot) e.push('invalid spotId');

      // Validate Answers
      event.questions?.forEach(q => {
        if (q.required && this.iE(this.answers[q.id])) {
          e.push(`answers[${q.id}] required`);
        }
      });
    }

    return e;
  }
}
