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
  url: string;
  uploadedAt: epochISOString;

  load(x: any): void {
    super.load(x);
    this.key = this.clean(x.key, String);
    this.url = this.clean(x.url, String);
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

    if (safeData.receipt) this.receipt = safeData.receipt;
    if (safeData.updatedAt) this.updatedAt = safeData.updatedAt;
  }

  validate(event?: ERSEvent): string[] {
    const e = super.validate();
    if (this.iE(this.eventId)) e.push('eventId');
    if (this.iE(this.userId)) e.push('userId');
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
