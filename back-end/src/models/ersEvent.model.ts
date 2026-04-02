import { epochISOString, Resource } from 'idea-toolbox';

import { User } from './user.model';

export enum EventType {
  NationalPlatform = 'NationalPlatform',
  NationalSchool = 'NationalSchool',
  Other = 'Other'
}

export class ERSEvent extends Resource {
  eventId: string;
  name: string;
  description: string;
  startAt: epochISOString;
  endAt: epochISOString;
  registrationOpenAt: epochISOString;
  registrationCloseAt: epochISOString;
  timezone: string;
  spots: EventSpot[];
  optionalTickets: EventOptionalTicket[];
  questions: EventQuestion[];
  additionalManagersIds: string[];
  paymentInfo: string;
  createdAt: epochISOString;
  updatedAt?: epochISOString;
  archivedAt?: epochISOString;
  receiptsCounter?: number;
  proofsOfPaymentDeleted?: boolean
  type: EventType;
  imageURL?: string;

  load(x: any): void {
    super.load(x);
    this.eventId = this.clean(x.eventId, String);
    this.name = this.clean(x.name, String);
    this.description = this.clean(x.description, String);
    this.startAt = this.clean(x.startAt, d => new Date(d).toISOString());
    this.endAt = this.clean(x.endAt, d => new Date(d).toISOString());
    this.registrationOpenAt = this.clean(x.registrationOpenAt, d => new Date(d).toISOString());
    this.registrationCloseAt = this.clean(x.registrationCloseAt, d => new Date(d).toISOString());
    this.timezone = this.clean(x.timezone, String);
    this.spots = this.cleanArray(x.spots, s => new EventSpot(s));
    this.optionalTickets = this.cleanArray(x.optionalTickets, t => new EventOptionalTicket(t));
    this.questions = this.cleanArray(x.questions, q => new EventQuestion(q));
    this.additionalManagersIds = this.cleanArray(x.additionalManagersIds, String).map(x => x.toLowerCase());
    this.paymentInfo = this.clean(x.paymentInfo, String);
    this.createdAt = this.clean(x.createdAt, d => new Date(d).toISOString(), new Date().toISOString());
    if (x.updatedAt) this.updatedAt = this.clean(x.updatedAt, d => new Date(d).toISOString());
    if (x.archivedAt) this.archivedAt = this.clean(x.archivedAt, d => new Date(d).toISOString());
    if (x.receiptsCounter !== undefined) this.receiptsCounter = this.clean(x.receiptsCounter, Number);
    if (x.proofsOfPaymentDeleted) this.proofsOfPaymentDeleted = this.clean(x.proofsOfPaymentDeleted, Boolean);
    this.type = this.clean(x.type, String, EventType.Other) as EventType;
    this.imageURL = this.clean(x.imageURL, String);
  }

  safeLoad(newData: any, safeData: any): void {
    super.safeLoad(newData, safeData);
    this.eventId = safeData.eventId;
    this.createdAt = safeData.createdAt;
    if (safeData.updatedAt) this.updatedAt = safeData.updatedAt;
    if (safeData.archivedAt) this.archivedAt = safeData.archivedAt;
    if (safeData.proofsOfPaymentDeleted) this.proofsOfPaymentDeleted = safeData.proofsOfPaymentDeleted;
    if (safeData.imageURL) this.imageURL = safeData.imageURL;
  }

  validate(): string[] {
    const e = super.validate();
    if (this.iE(this.name)) e.push('name');
    if (this.iE(this.type)) e.push('type');
    if (this.iE(this.description)) e.push('description');
    if (this.iE(this.startAt)) e.push('startAt');
    if (this.iE(this.endAt)) e.push('endAt');
    if (this.iE(this.registrationOpenAt)) e.push('registrationOpenAt');
    if (this.iE(this.registrationCloseAt)) e.push('registrationCloseAt');
    if (this.iE(this.timezone)) e.push('timezone');
    if (this.iE(this.paymentInfo)) e.push('paymentInfo');
    if (!this.spots || this.spots.length === 0) e.push('spots');

    if (this.startAt && this.endAt && this.endAt < this.startAt) e.push('endAt < startAt');
    if (this.registrationOpenAt && this.registrationCloseAt && this.registrationCloseAt < this.registrationOpenAt) e.push('registrationCloseAt < registrationOpenAt');
    if (this.registrationCloseAt && this.startAt && this.registrationCloseAt > this.startAt) e.push('registrationCloseAt > startAt');

    this.spots?.forEach((s, i) => {
      const errors = s.validate();
      if (errors.length) e.push(`spots[${i}]`);
    });
    this.optionalTickets?.forEach((t, i) => {
      const errors = t.validate();
      if (errors.length) e.push(`optionalTickets[${i}]`);
    });
    this.questions?.forEach((q, i) => {
      const errors = q.validate();
      if (errors.length) e.push(`questions[${i}]`);
    });

    return e;
  }

  canUserManage(user: User): boolean {
    return user.isAdministrator || user.canManageERSEvents || this.additionalManagersIds.includes(user.userId);
  }

  isRegistrationOpen(): boolean {
    const now = new Date().toISOString();
    return this.registrationOpenAt && this.registrationCloseAt && now >= this.registrationOpenAt && now <= this.registrationCloseAt;
  }

  isEnded(): boolean {
    return this.endAt && new Date().toISOString() > this.endAt;
  }
}

export class EventOptionalTicket extends Resource {
  id: string;
  name: string;
  description?: string;
  price: number;

  load(x: any): void {
    super.load(x);
    this.id = this.clean(x.id, String);
    this.name = this.clean(x.name, String);
    this.description = this.clean(x.description, String);
    this.price = this.clean(x.price, Number);
  }

  validate(): string[] {
    const e = [];
    if (this.iE(this.id)) e.push('id');
    if (this.iE(this.name)) e.push('name');
    if (this.iE(this.description)) e.push('description');
    if (this.price < 0) e.push('price');
    return e;
  }
}

export class EventSpot extends Resource {
  id: string;
  name: string;
  price: number;
  limit: number;

  load(x: any): void {
    super.load(x);
    this.id = this.clean(x.id, String);
    this.name = this.clean(x.name, String);
    this.price = this.clean(x.price, Number);
    this.limit = this.clean(x.limit, Number);
  }

  validate(): string[] {
    const e = [];
    if (this.iE(this.id)) e.push('id');
    if (this.iE(this.name)) e.push('name');
    if (this.price < 0) e.push('price');
    if (this.limit < 0) e.push('limit');
    return e;
  }
}

export enum QuestionType {
  TEXT = 'text',
  RADIOBOX = 'radiobox',
  CHECKBOX = 'checkbox',
  DATE = 'date'
}

export class EventQuestion extends Resource {
  id: string;
  text: string;
  type: QuestionType;
  options: string[]; // For radiobox and checkbox
  required: boolean;

  load(x: any): void {
    super.load(x);
    this.id = this.clean(x.id, String);
    this.text = this.clean(x.text, String);
    this.type = this.clean(x.type, String, QuestionType.TEXT) as QuestionType;
    this.options = this.cleanArray(x.options, String);
    this.required = this.clean(x.required, Boolean, false);
  }

  validate(): string[] {
    const e = [];
    if (this.iE(this.id)) e.push('id');
    if (this.iE(this.text)) e.push('text');
    if (this.type !== QuestionType.TEXT && this.type !== QuestionType.DATE && (!this.options || this.options.length === 0)) e.push('options');
    return e;
  }
}
