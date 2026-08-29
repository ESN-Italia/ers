import { epochISOString, Resource } from 'idea-toolbox';

import { User } from './user.model';

/**
 * The id of the invoice synthesized for backward compatibility with events created before the
 * multi-invoice feature (they had a single `paymentInfo`/`invoiceDueDate`). Registrations created
 * before the feature map their single proof of payment onto this same invoice id.
 */
export const DEFAULT_INVOICE_ID = 'default';
export const DEFAULT_INVOICE_NAME = 'Payment';

export enum EventType {
  NationalPlatform = 'NationalPlatform',
  NationalSchool = 'NationalSchool',
  Other = 'Other'
}

export class ERSEvent extends Resource {
  eventId: string;
  name: string;
  location: string;
  description: string;
  startAt: epochISOString;
  endAt: epochISOString;
  registrationOpenAt: epochISOString;
  registrationCloseAt: epochISOString;
  invoiceDueDate: epochISOString;
  timezone: string;
  spots: EventSpot[];
  optionalTickets: EventOptionalTicket[];
  questions: EventQuestion[];
  /**
   * The invoices to bill for this event. There is always exactly one primary invoice (it carries the
   * spot fee); additional invoices collect their own standard products and associated optional tickets.
   */
  invoices: EventInvoice[];
  /**
   * Server-managed per-invoice numbering series (invoiceId -> last assigned number). Locked in safeLoad.
   */
  invoiceCounters: { [invoiceId: string]: number };
  additionalManagersIds: string[];
  /**
   * @deprecated Superseded by per-invoice `EventInvoice.paymentInfo`; kept for backward compatibility
   * and to seed the synthesized default invoice for legacy events.
   */
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
    this.location = this.clean(x.location, String);
    this.description = this.clean(x.description, String);
    this.startAt = this.clean(x.startAt, d => new Date(d).toISOString());
    this.endAt = this.clean(x.endAt, d => new Date(d).toISOString());
    this.registrationOpenAt = this.clean(x.registrationOpenAt, d => new Date(d).toISOString());
    this.registrationCloseAt = this.clean(x.registrationCloseAt, d => new Date(d).toISOString());
    this.invoiceDueDate = this.clean(x.invoiceDueDate, d => new Date(d).toISOString());
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

    // Multi-invoice: load the invoices, synthesizing a single primary "default" invoice for legacy
    // events (built from the deprecated event-level paymentInfo/invoiceDueDate) so downstream code can
    // always assume at least one invoice exists.
    this.invoices = this.cleanArray(x.invoices, i => new EventInvoice(i));
    if (!this.invoices.length) {
      this.invoices = [
        new EventInvoice({
          id: DEFAULT_INVOICE_ID,
          name: DEFAULT_INVOICE_NAME,
          isPrimary: true,
          paymentInfo: this.paymentInfo,
          dueDate: this.invoiceDueDate,
          products: []
        })
      ];
    }
    this.invoiceCounters = this.clean(x.invoiceCounters, Object, {});
    // Seed the default invoice's counter from the legacy shared counter so numbering does not restart.
    if (!Object.keys(this.invoiceCounters).length && this.receiptsCounter !== undefined) {
      this.invoiceCounters[DEFAULT_INVOICE_ID] = this.receiptsCounter;
    }
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
    // Numbering counters are server-owned: never let a client PUT of the event reset them.
    if (safeData.invoiceCounters) this.invoiceCounters = safeData.invoiceCounters;
    if (safeData.receiptsCounter !== undefined) this.receiptsCounter = safeData.receiptsCounter;
  }

  validate(): string[] {
    const e = super.validate();
    if (this.iE(this.name)) e.push('name');
    if (this.iE(this.location)) e.push('location');
    if (this.iE(this.type)) e.push('type');
    if (this.iE(this.description)) e.push('description');
    if (this.iE(this.startAt)) e.push('startAt');
    if (this.iE(this.endAt)) e.push('endAt');
    if (this.iE(this.registrationOpenAt)) e.push('registrationOpenAt');
    if (this.iE(this.registrationCloseAt)) e.push('registrationCloseAt');
    if (this.iE(this.timezone)) e.push('timezone');
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

    if (!this.invoices || this.invoices.length === 0) e.push('invoices');
    if ((this.invoices?.filter(inv => inv.isPrimary).length ?? 0) !== 1) e.push('invoices.primary');
    this.invoices?.forEach((inv, i) => {
      if (inv.validate().length) e.push(`invoices[${i}]`);
    });
    // Every optional-ticket invoice reference must resolve to an existing invoice.
    this.optionalTickets?.forEach((t, i) => {
      if (t.invoiceId && !this.invoices?.find(inv => inv.id === t.invoiceId)) e.push(`optionalTickets[${i}].invoiceId`);
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

  isRegistrationNotOpenYet(): boolean {
    const now = new Date().toISOString();
    return now < this.registrationOpenAt;
  }

  isRegistrationEnded(): boolean {
    const now = new Date().toISOString();
    return now > this.registrationCloseAt;
  }

  isEnded(): boolean {
    return this.endAt && new Date().toISOString() > this.endAt;
  }

  /**
   * All invoices defined for the event (always at least one; legacy events expose a synthesized default).
   */
  getInvoices(): EventInvoice[] {
    return this.invoices ?? [];
  }
  /**
   * The primary invoice — the one that carries the spot fee. Falls back to the first invoice.
   */
  getPrimaryInvoice(): EventInvoice {
    return this.invoices?.find(i => i.isPrimary) ?? this.invoices?.[0];
  }
  /**
   * Compute what a given registration owes on a specific invoice:
   *  - the spot fee, only on the primary invoice;
   *  - all of the invoice's standard products (mandatory for everyone);
   *  - the selected optional tickets assigned to this invoice (unassigned tickets fall on the primary).
   */
  getInvoiceAmountForRegistration(
    invoice: EventInvoice,
    reg: { spotId?: string; selectedOptionalTickets?: string[] }
  ): number {
    let total = 0;
    const primary = this.getPrimaryInvoice();

    if (primary && invoice.id === primary.id && reg.spotId) {
      const spot = this.spots?.find(s => s.id === reg.spotId);
      if (spot?.price) total += spot.price;
    }

    for (const p of invoice.products ?? []) total += p.price || 0;

    for (const ticketId of reg.selectedOptionalTickets ?? []) {
      const ticket = this.optionalTickets?.find(t => t.id === ticketId);
      if (!ticket) continue;
      const targetInvoiceId = ticket.invoiceId || primary?.id;
      if (targetInvoiceId === invoice.id) total += ticket.price || 0;
    }

    return total;
  }
  /**
   * The invoices a registration actually has to pay (amount > 0). Used to know which proofs are required
   * and, once all are confirmed, to mark the registration CONFIRMED.
   */
  getApplicableInvoices(reg: { spotId?: string; selectedOptionalTickets?: string[] }): EventInvoice[] {
    return this.getInvoices().filter(inv => this.getInvoiceAmountForRegistration(inv, reg) > 0);
  }
}

export class EventOptionalTicket extends Resource {
  id: string;
  name: string;
  description?: string;
  price: number;
  /**
   * The invoice this ticket's price is billed to. If unset, it falls on the primary invoice.
   */
  invoiceId?: string;

  load(x: any): void {
    super.load(x);
    this.id = this.clean(x.id, String);
    this.name = this.clean(x.name, String);
    this.description = this.clean(x.description, String);
    this.price = this.clean(x.price, Number);
    this.invoiceId = this.clean(x.invoiceId, String);
  }

  validate(): string[] {
    const e = [];
    if (this.iE(this.id)) e.push('id');
    if (this.iE(this.name)) e.push('name');
    if (this.price < 0) e.push('price');
    return e;
  }
}

/**
 * A mandatory line item on an invoice that every applicable registration must pay
 * (e.g. a participation fee to a section, a deposit to the national office).
 */
export class EventInvoiceProduct extends Resource {
  id: string;
  name: string;
  price: number;

  load(x: any): void {
    super.load(x);
    this.id = this.clean(x.id, String);
    this.name = this.clean(x.name, String);
    this.price = this.clean(x.price, Number);
  }

  validate(): string[] {
    const e = [];
    if (this.iE(this.id)) e.push('id');
    if (this.iE(this.name)) e.push('name');
    if (this.price < 0) e.push('price');
    return e;
  }
}

/**
 * An invoice to bill for the event. Each invoice has its own recipient/bank details (`paymentInfo`),
 * its own numbering series (see `ERSEvent.invoiceCounters`), its own standard products, and can have
 * optional tickets assigned to it. Exactly one invoice per event is `isPrimary` (it carries the spot fee).
 */
export class EventInvoice extends Resource {
  id: string;
  name: string;
  description?: string;
  /**
   * HTML with the bank/transfer details for THIS invoice's recipient (shown on the generated PDF).
   */
  paymentInfo: string;
  /**
   * Optional per-invoice due date; falls back to the event-level `invoiceDueDate` when unset.
   */
  dueDate?: epochISOString;
  isPrimary: boolean;
  products: EventInvoiceProduct[];

  load(x: any): void {
    super.load(x);
    this.id = this.clean(x.id, String);
    this.name = this.clean(x.name, String);
    this.description = this.clean(x.description, String);
    this.paymentInfo = this.clean(x.paymentInfo, String);
    if (x.dueDate) this.dueDate = this.clean(x.dueDate, d => new Date(d).toISOString());
    this.isPrimary = this.clean(x.isPrimary, Boolean, false);
    this.products = this.cleanArray(x.products, p => new EventInvoiceProduct(p));
  }

  validate(): string[] {
    const e = [];
    if (this.iE(this.id)) e.push('id');
    if (this.iE(this.name)) e.push('name');
    if (this.iE(this.paymentInfo)) e.push('paymentInfo');
    this.products?.forEach((p, i) => {
      if (p.validate().length) e.push(`products[${i}]`);
    });
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
  DATE = 'date',
  TIME = 'time',
  FILE = 'file'
}

export class EventQuestion extends Resource {
  id: string;
  text: string;
  type: QuestionType;
  options: string[]; // For radiobox and checkbox
  required: boolean;
  maxFileSizeMB?: number; // Maximum allowed file size in MB for QuestionType.FILE
  spotIdCondition?: string; // If set, this question is shown only if this spot is selected
  dependsOnQuestionId?: string; // If set, this question depends on another question
  dependsOnAnswer?: string; // The specific answer required for the dependency
  optionalTicketIdCondition?: string; // If set, this question is shown only if this optional ticket is selected

  load(x: any): void {
    super.load(x);
    this.id = this.clean(x.id, String);
    this.text = this.clean(x.text, String);
    this.type = this.clean(x.type, String, QuestionType.TEXT) as QuestionType;
    this.options = this.cleanArray(x.options, String);
    this.required = this.clean(x.required, Boolean, false);
    if (x.maxFileSizeMB !== undefined) this.maxFileSizeMB = this.clean(x.maxFileSizeMB, Number);
    this.spotIdCondition = this.clean(x.spotIdCondition, String);
    this.dependsOnQuestionId = this.clean(x.dependsOnQuestionId, String);
    this.dependsOnAnswer = this.clean(x.dependsOnAnswer, String);
    this.optionalTicketIdCondition = this.clean(x.optionalTicketIdCondition, String);
  }

  validate(): string[] {
    const e = [];
    if (this.iE(this.id)) e.push('id');
    if (this.iE(this.text)) e.push('text');
    if (this.type !== QuestionType.TEXT && this.type !== QuestionType.DATE && this.type !== QuestionType.TIME && this.type !== QuestionType.FILE && (!this.options || this.options.length === 0)) e.push('options');
    if (this.type === QuestionType.FILE && this.maxFileSizeMB !== undefined && this.maxFileSizeMB <= 0) e.push('maxFileSizeMB');
    return e;
  }
}
