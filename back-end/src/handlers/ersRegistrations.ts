///
/// IMPORTS
///

import { DynamoDB, HandledError, ResourceController, S3, SES } from 'idea-aws';

import { EMAIL_TEMPLATE_DETAILS, EmailTemplates } from '../models/configurations.model';
import { ERSEvent, EventInvoice } from '../models/ersEvent.model';
import {
  ERSRegistration,
  InvoicePayment,
  InvoicePaymentStatus,
  ProofOfPayment,
  RegistrationStatus
} from '../models/ersRegistration.model';
import { Subject } from '../models/subject.model';
import { User } from '../models/user.model';

///
/// CONSTANTS, ENVIRONMENT VARIABLES, HANDLER
///

const PROJECT = process.env.PROJECT;
const APP_DOMAIN = process.env.APP_DOMAIN;
const DDB_TABLES = {
  events: process.env.DDB_TABLE_ersEvents,
  registrations: process.env.DDB_TABLE_ersRegistrations
};
const S3_BUCKET_MEDIA = process.env.S3_BUCKET_MEDIA;
const S3_ATTACHMENTS_FOLDER = process.env.S3_ATTACHMENTS_FOLDER;
const S3_ASSETS_FOLDER = process.env.S3_ASSETS_FOLDER;

const ddb = new DynamoDB();
const s3 = new S3();
const ses = new SES();

// Statuses in which a registration is holding a spot (counts toward a spot's limit).
const ACTIVE_STATUSES = [RegistrationStatus.APPROVED, RegistrationStatus.PAID, RegistrationStatus.CONFIRMED];

export const handler = (ev: any): Promise<any> => new ERSRegistrationsRC(ev).handleRequest();

///
/// RESOURCE CONTROLLER
///

class ERSRegistrationsRC extends ResourceController {
  galaxyUser: User;
  managedEvent: ERSEvent;
  registration: ERSRegistration;

  constructor(event: any) {
    super(event, { resourceId: 'registrationId' });
    this.galaxyUser = new User(event.requestContext.authorizer.lambda.user);
  }

  protected async checkAuthBeforeRequest(): Promise<void> {
    // Load Event
    const eventId = this.event.pathParameters.eventId;
    try {
      this.managedEvent = new ERSEvent(
        await ddb.get({ TableName: DDB_TABLES.events, Key: { eventId } })
      );
    } catch (err) {
      throw new HandledError('Event not found');
    }

    if (this.resourceId) {
      try {
        this.registration = new ERSRegistration(
          await ddb.get({ TableName: DDB_TABLES.registrations, Key: { eventId, registrationId: this.resourceId } })
        );
      } catch (err) {
        throw new HandledError('Registration not found');
      }
    }
  }

  protected async getResources(): Promise<ERSRegistration[]> {
    // If manager, return all. If user, return theirs.
    const canManage = this.managedEvent.canUserManage(this.galaxyUser);

    let result: ERSRegistration[] = [];

    if (canManage) {
      result = (await ddb.query({
        TableName: DDB_TABLES.registrations,
        KeyConditionExpression: 'eventId = :eventId',
        ExpressionAttributeValues: { ':eventId': this.managedEvent.eventId }
      })).map(x => new ERSRegistration(x));
    } else {
      result = (await ddb.query({
        TableName: DDB_TABLES.registrations,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        FilterExpression: 'eventId = :eventId',
        ExpressionAttributeValues: { ':userId': this.galaxyUser.userId, ':eventId': this.managedEvent.eventId }
      })).map(x => new ERSRegistration(x));
    }

    return result;
  }

  protected async postResources(): Promise<ERSRegistration> {
    if (!this.managedEvent.isRegistrationOpen()) throw new HandledError('Registration is closed');

    const existing = await ddb.query({
      TableName: DDB_TABLES.registrations,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'eventId = :eventId',
      ExpressionAttributeValues: { ':userId': this.galaxyUser.userId, ':eventId': this.managedEvent.eventId }
    });
    if (existing.length) throw new HandledError('User already registered');

    this.registration = new ERSRegistration(this.body);
    this.registration.eventId = this.managedEvent.eventId;
    this.registration.userId = this.galaxyUser.userId;

    const userSubject = Subject.fromUser(this.galaxyUser);
    if (this.body.subject) {
      const bodySubject = new Subject(this.body.subject);
      userSubject.birthPlace = bodySubject.birthPlace;
      userSubject.gender = bodySubject.gender;
      userSubject.birthDate = bodySubject.birthDate;
      userSubject.nationality = bodySubject.nationality;
      userSubject.phone = bodySubject.phone;
      userSubject.preferredPronouns = bodySubject.preferredPronouns;
      userSubject.email = bodySubject.email;
    }
    this.registration.subject = userSubject;

    this.registration.registrationId = await ddb.IUNID(PROJECT);
    this.registration.status = RegistrationStatus.PENDING;
    this.registration.payments = {};
    this.registration.createdAt = new Date().toISOString();
    delete this.registration.updatedAt;

    const errors = this.registration.validate(this.managedEvent);
    if (errors.length) throw new HandledError(`Invalid fields: ${errors.join(', ')}`);


    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });

    return this.registration;
  }

  protected async putResource(): Promise<ERSRegistration> {
    const canManage = this.managedEvent.canUserManage(this.galaxyUser);
    if (this.registration.userId !== this.galaxyUser.userId && !canManage) {
      throw new HandledError('Unauthorized');
    }

    if (this.registration.status !== RegistrationStatus.PENDING && !canManage) {
      throw new HandledError('Cannot edit registration after it has been already processed');
    }

    // Owners can only edit while registration is open (matching POST); managers can edit anytime.
    if (!canManage && !this.managedEvent.isRegistrationOpen()) {
      throw new HandledError('Registration is closed');
    }

    const oldRegistration = new ERSRegistration(this.registration);
    this.registration.safeLoad(this.body, oldRegistration);
    this.registration.updatedAt = new Date().toISOString();

    const errors = this.registration.validate(this.managedEvent);
    if (errors.length) throw new HandledError(`Invalid fields: ${errors.join(', ')}`);

    // Reassigning the spot of an already-active registration via PUT must respect the spot capacity.
    if (this.registration.spotId !== oldRegistration.spotId && ACTIVE_STATUSES.includes(this.registration.status)) {
      await this.assertSpotWithinLimit(this.registration.spotId);
    }

    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });

    return this.registration;
  }

  protected async getResource(): Promise<ERSRegistration> {
    if (this.registration.userId !== this.galaxyUser.userId && !this.managedEvent.canUserManage(this.galaxyUser)) {
      throw new HandledError('Unauthorized');
    }

    return this.registration;
  }

  protected async patchResource(): Promise<ERSRegistration> {
    const isOwner = this.registration.userId === this.galaxyUser.userId;
    const canManage = this.managedEvent.canUserManage(this.galaxyUser);

    if (!isOwner && !canManage) {
      throw new HandledError('Unauthorized');
    }

    switch (this.body.action) {
      case 'GET_PROOF_OF_PAYMENT_UPLOAD_URL': return await this.getProofOfPaymentUploadUrl();
      case 'GET_PROOF_OF_PAYMENT_DOWNLOAD_URL': return await this.getProofOfPaymentDownloadUrl();
      case 'SUBMIT_PROOF_OF_PAYMENT': return await this.submitProofOfPayment();
      case 'DELETE_PROOF_OF_PAYMENT': return await this.deleteProofOfPayment();
      case 'SET_STATUS':
        if (!canManage) throw new HandledError('Unauthorized');
        return await this.setStatus(this.body.status);
      case 'SET_SPOT':
        if (!canManage) throw new HandledError('Unauthorized');
        return await this.setSpot(this.body.spotId);
      case 'CONFIRM_INVOICE_PAYMENT':
        if (!canManage) throw new HandledError('Unauthorized');
        return await this.setInvoicePaymentConfirmed(this.body.invoiceId, true);
      case 'UNCONFIRM_INVOICE_PAYMENT':
        if (!canManage) throw new HandledError('Unauthorized');
        return await this.setInvoicePaymentConfirmed(this.body.invoiceId, false);
      default: throw new HandledError('Unsupported action');
    }
  }

  protected async deleteResource(): Promise<void> {
    const canManage = this.managedEvent.canUserManage(this.galaxyUser);
    if (this.registration.userId !== this.galaxyUser.userId && !canManage) {
      throw new HandledError('Unauthorized');
    }

    // Owners may withdraw only before any payment is confirmed; afterwards the financial trail must be
    // preserved and only a manager can delete.
    if (!canManage) {
      const hasConfirmed = Object.values(this.registration.payments || {}).some(
        p => p.status === InvoicePaymentStatus.CONFIRMED
      );
      if (hasConfirmed || this.registration.status === RegistrationStatus.CONFIRMED) {
        throw new HandledError('Cannot withdraw a registration after a payment has been confirmed; please contact a manager');
      }
    }

    // Delete every uploaded proof-of-payment file from S3 (per-invoice, plus any legacy single proof).
    for (const payment of Object.values(this.registration.payments || {})) {
      if (payment.proofOfPayment?.key) {
        try {
          await s3.deleteObject({ bucket: S3_BUCKET_MEDIA, key: payment.proofOfPayment.key });
        } catch (err) {
          console.error('Failed to delete S3 resource on registration delete', err);
        }
      }
    }
    if (this.registration.proofOfPayment?.key) {
      try {
        await s3.deleteObject({ bucket: S3_BUCKET_MEDIA, key: this.registration.proofOfPayment.key });
      } catch (err) {
        console.error('Failed to delete legacy S3 proof on registration delete', err);
      }
    }

    await ddb.delete({
      TableName: DDB_TABLES.registrations,
      Key: {
        eventId: this.managedEvent.eventId,
        registrationId: this.registration.registrationId
      }
    });

    // We don't return anything for delete
  }

  ///
  /// STATUS & APPROVAL
  ///

  private async setStatus(status: RegistrationStatus): Promise<ERSRegistration> {
    const oldStatus = this.registration.status;
    if (oldStatus === status) return this.registration;

    switch (status) {
      case RegistrationStatus.APPROVED:
        await this.approveRegistration();
        break;
      case RegistrationStatus.CONFIRMED:
        // Manager shortcut: approve (if needed) and confirm every applicable invoice at once.
        await this.approveRegistration();
        for (const inv of this.managedEvent.getApplicableInvoices(this.registration)) {
          const payment = this.registration.payments[inv.id];
          if (payment && payment.status !== InvoicePaymentStatus.CONFIRMED) {
            payment.status = InvoicePaymentStatus.CONFIRMED;
            payment.confirmedAt = new Date().toISOString();
          }
        }
        this.recomputeOverallStatus();
        break;
      case RegistrationStatus.PENDING:
      case RegistrationStatus.REJECTED:
        this.registration.status = status;
        break;
      default:
        throw new HandledError('Unsupported status');
    }

    this.registration.updatedAt = new Date().toISOString();
    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });

    await this.sendStatusEmail(oldStatus, this.registration.status);

    return this.registration;
  }

  /**
   * Grant the spot: check capacity, stamp approvedAt, and ensure every applicable invoice has a payment
   * entry with an invoice number drawn from its own per-invoice counter. If there is nothing to pay, the
   * registration is confirmed immediately.
   */
  private async approveRegistration(): Promise<void> {
    await this.assertSpotWithinLimit(this.registration.spotId);

    if (!this.registration.approvedAt) this.registration.approvedAt = new Date().toISOString();

    const applicable = this.managedEvent.getApplicableInvoices(this.registration);

    if (!applicable.length) {
      this.registration.status = RegistrationStatus.CONFIRMED;
      return;
    }

    await this.ensureInvoiceCountersMap();
    for (const inv of applicable) {
      let payment = this.registration.payments[inv.id];
      if (!payment) {
        payment = new InvoicePayment({ invoiceId: inv.id, status: InvoicePaymentStatus.PENDING });
        this.registration.payments[inv.id] = payment;
      }
      if (payment.invoiceNumber === undefined) payment.invoiceNumber = await this.nextInvoiceNumber(inv.id);
    }

    if (this.registration.status === RegistrationStatus.PENDING || this.registration.status === RegistrationStatus.REJECTED) {
      this.registration.status = RegistrationStatus.APPROVED;
    }
    this.recomputeOverallStatus();
  }

  /**
   * Roll the overall registration status up from the per-invoice payments: once every applicable invoice
   * is CONFIRMED the registration is CONFIRMED, otherwise it stays APPROVED. Never touches PENDING/REJECTED.
   */
  private recomputeOverallStatus(): void {
    if (this.registration.status === RegistrationStatus.PENDING || this.registration.status === RegistrationStatus.REJECTED) {
      return;
    }
    const applicable = this.managedEvent.getApplicableInvoices(this.registration);
    const allConfirmed = applicable.every(
      inv => this.registration.payments[inv.id]?.status === InvoicePaymentStatus.CONFIRMED
    );
    this.registration.status = allConfirmed ? RegistrationStatus.CONFIRMED : RegistrationStatus.APPROVED;
  }

  private async setSpot(spotId: string): Promise<ERSRegistration> {
    const spot = this.managedEvent.spots.find(s => s.id === spotId);
    if (!spot) throw new HandledError('Invalid spot');

    if (ACTIVE_STATUSES.includes(this.registration.status)) await this.assertSpotWithinLimit(spotId);

    const oldSpotId = this.registration.spotId;
    this.registration.spotId = spotId;
    this.registration.updatedAt = new Date().toISOString();
    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });

    if (oldSpotId !== spotId) {
      await this.sendEmail('SPOT_CHANGED');
    }

    return this.registration;
  }

  /**
   * Ensure a given spot still has capacity for one more active registration (excluding this one).
   */
  private async assertSpotWithinLimit(spotId: string): Promise<void> {
    const spot = this.managedEvent.spots.find(s => s.id === spotId);
    if (!spot) throw new HandledError('Invalid spot');
    if (!spot.limit) return;

    const regs = await ddb.query({
      TableName: DDB_TABLES.registrations,
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: { ':eventId': this.managedEvent.eventId }
    });
    const spotCount = regs.filter(r =>
      r.spotId === spotId &&
      r.registrationId !== this.registration.registrationId &&
      ACTIVE_STATUSES.includes(r.status)
    ).length;
    if (spotCount >= spot.limit) throw new HandledError(`Spot limit exceeded: ${spot.name}`);
  }

  /**
   * Create the event's invoiceCounters map if the stored item does not have it yet (legacy events),
   * seeding it from the in-memory value (which already carries the migrated legacy receiptsCounter).
   */
  private async ensureInvoiceCountersMap(): Promise<void> {
    await ddb.update({
      TableName: DDB_TABLES.events,
      Key: { eventId: this.managedEvent.eventId },
      UpdateExpression: 'SET invoiceCounters = if_not_exists(invoiceCounters, :seed)',
      ExpressionAttributeValues: { ':seed': this.managedEvent.invoiceCounters || {} }
    });
  }

  /**
   * Atomically increment and return the next number in a specific invoice's numbering series. Using a
   * conditional atomic update (rather than read-modify-write on the whole event) avoids duplicate invoice
   * numbers under concurrent approvals and never clobbers concurrent event edits.
   */
  private async nextInvoiceNumber(invoiceId: string): Promise<number> {
    const res = await ddb.update({
      TableName: DDB_TABLES.events,
      Key: { eventId: this.managedEvent.eventId },
      UpdateExpression: 'SET invoiceCounters.#id = if_not_exists(invoiceCounters.#id, :zero) + :one',
      ExpressionAttributeNames: { '#id': invoiceId },
      ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
      ReturnValues: 'UPDATED_NEW'
    });
    return Number(res.Attributes?.invoiceCounters?.[invoiceId]);
  }

  ///
  /// PER-INVOICE PROOF OF PAYMENT
  ///

  /**
   * The S3 key prefix under which this registration's proof for a specific invoice must live. Any key
   * outside this prefix belongs to another registration/invoice (or is an arbitrary object) and must
   * never be signed, stored or deleted on this registration's behalf.
   */
  private getProofKeyPrefix(invoiceId: string): string {
    return `${S3_ATTACHMENTS_FOLDER}/events/${this.managedEvent.eventId}/proof-of-payments/${this.registration.registrationId}/${invoiceId}/`;
  }
  private isOwnProofKey(invoiceId: string, key: string): boolean {
    if (!key || typeof key !== 'string' || key.includes('..')) return false;
    return key.startsWith(this.getProofKeyPrefix(invoiceId));
  }

  /**
   * Resolve the applicable invoice and its payment entry for an invoice-scoped action, or throw.
   */
  private getInvoicePayment(invoiceId: string): { invoice: EventInvoice; payment: InvoicePayment } {
    if (!invoiceId) throw new HandledError('Missing invoiceId');
    const invoice = this.managedEvent.getApplicableInvoices(this.registration).find(inv => inv.id === invoiceId);
    if (!invoice) throw new HandledError('Invalid invoice');
    const payment = this.registration.payments[invoiceId];
    if (!payment) throw new HandledError('Invoice not ready for payment');
    return { invoice, payment };
  }

  private async getProofOfPaymentUploadUrl(): Promise<any> {
    const invoiceId = this.body.invoiceId;
    const { payment } = this.getInvoicePayment(invoiceId);
    if (this.registration.status !== RegistrationStatus.APPROVED) throw new HandledError('Cannot upload proof of payment in this status');
    if (payment.status === InvoicePaymentStatus.CONFIRMED) throw new HandledError('This invoice payment is already confirmed');

    const extension = this.body.extension ? `.${this.body.extension}` : '';
    const key = `${this.getProofKeyPrefix(invoiceId)}${Date.now()}_proof_of_payment${extension}`;
    const url = await s3.signedURLPut(S3_BUCKET_MEDIA, key);
    return { url: url.url, key };
  }

  private async getProofOfPaymentDownloadUrl(): Promise<any> {
    const invoiceId = this.body.invoiceId;
    const { payment } = this.getInvoicePayment(invoiceId);
    if (!payment.proofOfPayment?.key) throw new HandledError('No proof of payment found');
    if (!this.isOwnProofKey(invoiceId, payment.proofOfPayment.key)) throw new HandledError('Invalid proof of payment key');

    const extensionMatch = payment.proofOfPayment.key.match(/\.[0-9a-z]+$/i);
    const extension = extensionMatch ? extensionMatch[0] : '';
    const filename = `${this.registration.subject.name.replace(/\s+/g, '_')}_proof_of_payment${extension}`;
    return await s3.signedURLGet(S3_BUCKET_MEDIA, payment.proofOfPayment.key, { filename });
  }

  private async submitProofOfPayment(): Promise<ERSRegistration> {
    const invoiceId = this.body.invoiceId;
    const { payment } = this.getInvoicePayment(invoiceId);
    if (this.registration.status !== RegistrationStatus.APPROVED) throw new HandledError('Cannot upload proof of payment in this status');
    if (payment.status === InvoicePaymentStatus.CONFIRMED) throw new HandledError('This invoice payment is already confirmed');
    if (!this.body.proofOfPaymentKey) throw new HandledError('Missing proof of payment key');

    const key = this.body.proofOfPaymentKey;
    // The client only ever receives upload URLs scoped to its own registration/invoice folder, so any key
    // outside that prefix is a forged reference to another registration's (or an arbitrary) object.
    if (!this.isOwnProofKey(invoiceId, key)) throw new HandledError('Invalid proof of payment key');

    const exists = await s3.doesObjectExist({ bucket: S3_BUCKET_MEDIA, key });
    if (!exists) throw new HandledError('Proof of payment file not found in storage');

    payment.proofOfPayment = new ProofOfPayment({ key, uploadedAt: new Date().toISOString() });
    payment.status = InvoicePaymentStatus.PAID;
    this.registration.updatedAt = new Date().toISOString();

    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });
    return this.registration;
  }

  private async deleteProofOfPayment(): Promise<ERSRegistration> {
    const invoiceId = this.body.invoiceId;
    const { payment } = this.getInvoicePayment(invoiceId);
    if (!payment.proofOfPayment?.key) throw new HandledError('No proof of payment to delete');

    const canManage = this.managedEvent.canUserManage(this.galaxyUser);
    if (!canManage && payment.status === InvoicePaymentStatus.CONFIRMED) {
      throw new HandledError('Cannot delete a confirmed proof of payment; please contact a manager');
    }
    if (!this.isOwnProofKey(invoiceId, payment.proofOfPayment.key)) throw new HandledError('Invalid proof of payment key');

    try {
      await s3.deleteObject({ bucket: S3_BUCKET_MEDIA, key: payment.proofOfPayment.key });
    } catch (err) {
      console.error('Failed to delete S3 resource', err);
      // We continue to clean up the payment state even if S3 delete fails.
    }

    delete payment.proofOfPayment;
    payment.status = InvoicePaymentStatus.PENDING;
    delete payment.confirmedAt;
    this.recomputeOverallStatus();
    this.registration.updatedAt = new Date().toISOString();

    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });
    return this.registration;
  }

  /**
   * A manager confirms (or reverts the confirmation of) the payment of a single invoice. When the last
   * applicable invoice becomes confirmed, the whole registration rolls up to CONFIRMED.
   */
  private async setInvoicePaymentConfirmed(invoiceId: string, confirmed: boolean): Promise<ERSRegistration> {
    const { payment } = this.getInvoicePayment(invoiceId);
    const oldStatus = this.registration.status;

    if (confirmed) {
      payment.status = InvoicePaymentStatus.CONFIRMED;
      payment.confirmedAt = new Date().toISOString();
    } else {
      payment.status = payment.proofOfPayment ? InvoicePaymentStatus.PAID : InvoicePaymentStatus.PENDING;
      delete payment.confirmedAt;
    }
    this.recomputeOverallStatus();
    this.registration.updatedAt = new Date().toISOString();

    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });

    if (oldStatus !== RegistrationStatus.CONFIRMED && this.registration.status === RegistrationStatus.CONFIRMED) {
      await this.sendEmail('PAYMENT_CONFIRMED');
    }

    return this.registration;
  }

  ///
  /// EMAILS
  ///

  private async sendStatusEmail(oldStatus: RegistrationStatus, newStatus: RegistrationStatus): Promise<void> {
    if (oldStatus === newStatus) return;
    switch (newStatus) {
      case RegistrationStatus.APPROVED:
        await this.sendEmail('REGISTRATION_APPROVED');
        break;
      case RegistrationStatus.REJECTED:
        await this.sendEmail('REGISTRATION_REJECTED');
        break;
      case RegistrationStatus.CONFIRMED:
        await this.sendEmail('PAYMENT_CONFIRMED');
        break;
      default:
        break;
    }
  }

  private getEmailTemplateEnum(type: string): EmailTemplates {
    switch (type) {
      case 'REGISTRATION_APPROVED': return EmailTemplates.ERS_REGISTRATION_APPROVED;
      case 'REGISTRATION_REJECTED': return EmailTemplates.ERS_REGISTRATION_REJECTED;
      case 'PAYMENT_CONFIRMED': return EmailTemplates.ERS_PAYMENT_CONFIRMED;
      case 'SPOT_CHANGED': return EmailTemplates.ERS_SPOT_CHANGED;
      case 'STATUS_CHANGED': return EmailTemplates.ERS_STATUS_CHANGED;
      default: throw new HandledError('Template not found');
    }
  }

  private async ensureSESTemplate(emailEnum: EmailTemplates): Promise<void> {
    const details = EMAIL_TEMPLATE_DETAILS[emailEnum];
    if (!details) throw new HandledError('Template details not found');
    const content = await s3.getObjectAsText({
      bucket: S3_BUCKET_MEDIA,
      key: `${S3_ASSETS_FOLDER}/${details.templateName}.hbs`
    });
    await ses.setTemplate(`${details.templateName}-${process.env.STAGE}`, details.defaultSubject, content, true);
  }

  private async sendEmail(type: string): Promise<void> {
    if (!this.registration.subject?.email) return;

    const emailEnum = this.getEmailTemplateEnum(type);
    const details = EMAIL_TEMPLATE_DETAILS[emailEnum];
    const currentSpot = this.managedEvent.spots?.find(s => s.id === this.registration.spotId);
    const templateData = {
      user: this.registration.subject.name,
      eventName: this.managedEvent.name,
      spotName: currentSpot?.name || '',
      status: this.registration.status,
      registrationUrl: `https://${APP_DOMAIN}/t/ers-events/${this.registration.eventId}/registration`
    };

    const sesParams = {
      toAddresses: [this.registration.subject.email],
      template: `${details.templateName}-${process.env.STAGE}`,
      templateData
    };
    const sesConfig = {
      source: process.env.SES_SOURCE_ADDRESS,
      sourceArn: process.env.SES_IDENTITY_ARN,
      region: process.env.SES_REGION
    };

    try {
      await ses.sendTemplatedEmail(sesParams, sesConfig);
    } catch (e) {
      // If template does not exist, provision it with default subject and retry
      try {
        await this.ensureSESTemplate(emailEnum);
        await ses.sendTemplatedEmail(sesParams, sesConfig);
      } catch (retryError) {
        console.error('Failed to send email', retryError);
        // Don't fail the request if email fails, just log it.
      }
    }
  }
}
