import { epochISOString, Resource } from 'idea-toolbox';

import { User } from './user.model';

/**
 * The id of the invoice synthesized for backward compatibility with events created before the
 * multi-invoice feature (they had a single `paymentInfo`/`invoiceDueDate`). Registrations created
 * before the feature map their single proof of payment onto this same invoice id.
 */
export const DEFAULT_INVOICE_ID = 'default';
export const DEFAULT_INVOICE_NAME = 'Payment';

/**
 * What a registration answered, as far as the event needs to know to compute visibility and fees.
 */
export interface RegistrationChoices {
  spotId?: string;
  answers?: { [questionId: string]: string | string[] };
  /**
   * @deprecated Optional tickets are now questions; kept to read registrations created before (see
   * `ERSEvent.migrateLegacyTicketSelections`).
   */
  selectedOptionalTickets?: string[];
}

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
  /**
   * The questions asked on registration. The options of choice questions can carry a price, billed to the
   * question's invoice: this is also how optional tickets are modelled (see `loadLegacyOptionalTickets`).
   */
  questions: EventQuestion[];
  /**
   * The invoices to bill for this event. There is always exactly one primary invoice (it carries the
   * spot fee); additional invoices collect their own standard products and the priced options billed to them.
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
    this.questions = this.cleanArray(x.questions, q => new EventQuestion(q));
    this.loadLegacyOptionalTickets(x.optionalTickets, x.questions);
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
    this.questions?.forEach((q, i) => {
      const errors = q.validate();
      if (errors.length) e.push(`questions[${i}]`);
    });

    if (!this.invoices || this.invoices.length === 0) e.push('invoices');
    if ((this.invoices?.filter(inv => inv.isPrimary).length ?? 0) !== 1) e.push('invoices.primary');
    this.invoices?.forEach((inv, i) => {
      if (inv.validate().length) e.push(`invoices[${i}]`);
    });
    // Every question's invoice reference must resolve to an existing invoice.
    this.questions?.forEach((q, i) => {
      if (q.invoiceId && !this.invoices?.find(inv => inv.id === q.invoiceId)) e.push(`questions[${i}].invoiceId`);
    });

    return e;
  }

  /**
   * Optional tickets used to be a list of their own; they are now questions whose options carry a price. Each legacy
   * ticket becomes a checkbox question with the ticket's id and a single option named after it, placed before the
   * other questions (so that questions can depend on it); a question shown "only if ticket X is selected" becomes a
   * question that depends on that option. Saving the event persists the conversion.
   */
  private loadLegacyOptionalTickets(rawTickets: any[], rawQuestions: any[]): void {
    const tickets = (Array.isArray(rawTickets) ? rawTickets : []).filter(t => t?.id);
    if (!tickets.length) return;

    for (const rawQuestion of Array.isArray(rawQuestions) ? rawQuestions : []) {
      if (!rawQuestion?.optionalTicketIdCondition) continue;
      const question = this.questions.find(q => q.id === String(rawQuestion.id));
      if (!question || question.dependsOnQuestionId) continue;
      const ticket = tickets.find(t => String(t.id) === String(rawQuestion.optionalTicketIdCondition));
      question.dependsOnQuestionId = String(rawQuestion.optionalTicketIdCondition);
      question.dependsOnAnswer = ticket ? String(ticket.name ?? '') : '';
    }

    const ticketQuestions = tickets
      .filter(t => !this.questions.some(q => q.id === String(t.id)))
      .map(
        t =>
          new EventQuestion({
            id: t.id,
            text: t.name,
            description: t.description,
            type: QuestionType.CHECKBOX,
            options: [{ text: t.name, price: t.price }],
            invoiceId: t.invoiceId,
            required: false
          })
      );
    this.questions = [...ticketQuestions, ...this.questions];
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
   * The invoice a question's option prices are billed to: its own, if it still exists, otherwise the primary.
   */
  getQuestionInvoiceId(question: EventQuestion): string {
    const own = question.invoiceId && this.invoices?.find(inv => inv.id === question.invoiceId);
    return own ? own.id : this.getPrimaryInvoice()?.id;
  }
  /**
   * The answer a registration gave to a question. A legacy optional-ticket selection reads as the answer to the
   * question that ticket became.
   */
  getAnswer(question: EventQuestion, reg: RegistrationChoices): string | string[] | undefined {
    const answer = reg.answers?.[question.id];
    if (answer !== undefined) return answer;
    if (reg.selectedOptionalTickets?.includes(question.id) && question.options?.length) return [question.options[0].text];
    return undefined;
  }
  /**
   * Whether a question applies to a registration, given its spot and the answers it depends on.
   */
  isQuestionVisible(question: EventQuestion, reg: RegistrationChoices): boolean {
    if (question.spotIdCondition && reg.spotId !== question.spotIdCondition) return false;
    if (question.dependsOnQuestionId) {
      const parent = this.questions?.find(q => q.id === question.dependsOnQuestionId);
      const parentAnswer = parent ? this.getAnswer(parent, reg) : reg.answers?.[question.dependsOnQuestionId];
      if (Array.isArray(parentAnswer)) {
        if (!parentAnswer.includes(question.dependsOnAnswer)) return false;
      } else if (parentAnswer !== question.dependsOnAnswer) {
        return false;
      }
    }
    return true;
  }
  /**
   * The options a registration chose for a choice question (none for other question types).
   */
  getSelectedOptions(question: EventQuestion, reg: RegistrationChoices): EventQuestionOption[] {
    if (!question.hasOptions()) return [];
    const answer = this.getAnswer(question, reg);
    const texts = Array.isArray(answer) ? answer : answer ? [answer] : [];
    return (question.options ?? []).filter(o => texts.includes(o.text));
  }
  /**
   * The priced options a registration chose that are billed to a given invoice. Questions that don't apply to the
   * registration are never billed, even if they carry a stale answer.
   */
  getChosenPricedOptions(
    invoice: EventInvoice,
    reg: RegistrationChoices
  ): { question: EventQuestion; option: EventQuestionOption }[] {
    const chosen: { question: EventQuestion; option: EventQuestionOption }[] = [];
    for (const question of this.questions ?? []) {
      if (this.getQuestionInvoiceId(question) !== invoice.id || !this.isQuestionVisible(question, reg)) continue;
      for (const option of this.getSelectedOptions(question, reg)) if (option.price > 0) chosen.push({ question, option });
    }
    return chosen;
  }
  /**
   * Compute what a given registration owes on a specific invoice:
   *  - the spot fee, only on the primary invoice;
   *  - all of the invoice's standard products (mandatory for everyone);
   *  - the price of every chosen option of the questions billed to this invoice.
   */
  getInvoiceAmountForRegistration(invoice: EventInvoice, reg: RegistrationChoices): number {
    let total = 0;
    const primary = this.getPrimaryInvoice();

    if (primary && invoice.id === primary.id && reg.spotId) {
      const spot = this.spots?.find(s => s.id === reg.spotId);
      if (spot?.price) total += spot.price;
    }

    for (const p of invoice.products ?? []) total += p.price || 0;

    for (const { option } of this.getChosenPricedOptions(invoice, reg)) total += option.price;

    return total;
  }
  /**
   * The invoices a registration actually has to pay (amount > 0). Used to know which proofs are required
   * and, once all are confirmed, to mark the registration CONFIRMED.
   */
  getApplicableInvoices(reg: RegistrationChoices): EventInvoice[] {
    return this.getInvoices().filter(inv => this.getInvoiceAmountForRegistration(inv, reg) > 0);
  }
  /**
   * Rewrite a registration's legacy optional-ticket selections as answers to the questions those tickets became.
   */
  migrateLegacyTicketSelections(reg: RegistrationChoices): void {
    if (!reg.selectedOptionalTickets) return;
    if (!reg.answers) reg.answers = {};
    for (const ticketId of reg.selectedOptionalTickets) {
      const question = this.questions?.find(q => q.id === ticketId);
      if (question?.options?.length && reg.answers[ticketId] === undefined) reg.answers[ticketId] = [question.options[0].text];
    }
    delete reg.selectedOptionalTickets;
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
 * the priced options of questions billed to it. Exactly one invoice per event is `isPrimary` (it carries the spot fee).
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

/**
 * An option of a choice question. Answers store the option's text, so texts are unique within a question.
 */
export class EventQuestionOption extends Resource {
  text: string;
  /**
   * What choosing this option adds to the fee, on the question's invoice. 0 for a free option.
   */
  price: number;

  load(x: any): void {
    super.load(x);
    this.text = this.clean(x.text, String);
    this.price = this.clean(x.price, Number, 0);
  }

  validate(): string[] {
    const e = [];
    if (this.iE(this.text)) e.push('text');
    if (!(this.price >= 0)) e.push('price');
    return e;
  }
}

export class EventQuestion extends Resource {
  id: string;
  text: string;
  description?: string;
  type: QuestionType;
  options: EventQuestionOption[]; // For radiobox and checkbox
  required: boolean;
  maxFileSizeMB?: number; // Maximum allowed file size in MB for QuestionType.FILE
  /**
   * For QuestionType.CHECKBOX: the most options a participant can choose. Unset for no limit.
   */
  maxSelections?: number;
  /**
   * The invoice the options' prices are billed to. If unset (or no longer existing), they fall on the primary.
   */
  invoiceId?: string;
  spotIdCondition?: string; // If set, this question is shown only if this spot is selected
  dependsOnQuestionId?: string; // If set, this question depends on another question
  dependsOnAnswer?: string; // The specific answer required for the dependency

  load(x: any): void {
    super.load(x);
    this.id = this.clean(x.id, String);
    this.text = this.clean(x.text, String);
    this.description = this.clean(x.description, String);
    this.type = this.clean(x.type, String, QuestionType.TEXT) as QuestionType;
    // Options used to be plain texts: read those as free options.
    this.options = this.cleanArray(x.options, o => new EventQuestionOption(typeof o === 'string' ? { text: o } : o));
    this.required = this.clean(x.required, Boolean, false);
    if (x.maxFileSizeMB !== undefined) this.maxFileSizeMB = this.clean(x.maxFileSizeMB, Number);
    if (x.maxSelections !== undefined && x.maxSelections !== null && x.maxSelections !== '')
      this.maxSelections = this.clean(x.maxSelections, Number);
    this.invoiceId = this.clean(x.invoiceId, String);
    this.spotIdCondition = this.clean(x.spotIdCondition, String);
    this.dependsOnQuestionId = this.clean(x.dependsOnQuestionId, String);
    this.dependsOnAnswer = this.clean(x.dependsOnAnswer, String);
  }

  validate(): string[] {
    const e = [];
    if (this.iE(this.id)) e.push('id');
    if (this.iE(this.text)) e.push('text');
    if (this.hasOptions()) {
      if (!this.options?.length) e.push('options');
      if (this.options?.some(o => o.validate().length)) e.push('options');
      const texts = (this.options ?? []).map(o => o.text);
      if (new Set(texts).size !== texts.length) e.push('options');
    }
    if (this.type === QuestionType.CHECKBOX && this.maxSelections !== undefined) {
      if (!Number.isInteger(this.maxSelections) || this.maxSelections < 1) e.push('maxSelections');
    }
    if (this.type === QuestionType.FILE && this.maxFileSizeMB !== undefined && this.maxFileSizeMB <= 0) e.push('maxFileSizeMB');
    return e;
  }

  /**
   * Whether the question is answered by choosing among its options.
   */
  hasOptions(): boolean {
    return this.type === QuestionType.RADIOBOX || this.type === QuestionType.CHECKBOX;
  }

  /**
   * Whether any of the question's options adds to the fee.
   */
  hasPrices(): boolean {
    return this.hasOptions() && (this.options ?? []).some(o => o.price > 0);
  }
}
