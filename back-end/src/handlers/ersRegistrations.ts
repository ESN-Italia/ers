///
/// IMPORTS
///

import { DynamoDB, HandledError, ResourceController, S3, SES } from 'idea-aws';

import { EMAIL_TEMPLATE_DETAILS, EmailTemplates } from '../models/configurations.model';
import { ERSEvent } from '../models/ersEvent.model';
import { ERSRegistration, ProofOfPayment, RegistrationStatus } from '../models/ersRegistration.model';
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

const ddb = new DynamoDB();
const s3 = new S3();
const ses = new SES();

// New constant for SES sender details
const SES_SENDER = {
  source: process.env.SES_SOURCE_ADDRESS,
  sourceArn: process.env.SES_IDENTITY_ARN,
  region: process.env.SES_REGION,
  replyToAddresses: [process.env.SES_SOURCE_ADDRESS] // Default reply-to
};

// Define the allowed registration state changes
const ALLOWED_STATUS_TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  [RegistrationStatus.PENDING]: [RegistrationStatus.APPROVED, RegistrationStatus.REJECTED],
  [RegistrationStatus.APPROVED]: [RegistrationStatus.PAID, RegistrationStatus.REJECTED],
  [RegistrationStatus.PAID]: [RegistrationStatus.APPROVED, RegistrationStatus.CONFIRMED, RegistrationStatus.REJECTED],
  [RegistrationStatus.CONFIRMED]: [RegistrationStatus.REJECTED], // Cancellations allowed
  [RegistrationStatus.REJECTED]: [] // Terminal state
};

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

    const oldRegistration = new ERSRegistration(this.registration);
    this.registration.safeLoad(this.body, oldRegistration);
    this.registration.updatedAt = new Date().toISOString();

    const errors = this.registration.validate(this.managedEvent);
    if (errors.length) throw new HandledError(`Invalid fields: ${errors.join(', ')}`);

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
    if (this.body.action === 'GET_PROOF_OF_PAYMENT_UPLOAD_URL') return await this.getProofOfPaymentUploadUrl();
    if (this.body.action === 'GET_PROOF_OF_PAYMENT_DOWNLOAD_URL') return await this.getProofOfPaymentDownloadUrl();
    if (this.body.action === 'SUBMIT_PROOF_OF_PAYMENT') return await this.submitProofOfPayment();

    if (!this.managedEvent.canUserManage(this.galaxyUser)) throw new HandledError('Unauthorized');

    switch (this.body.action) {
      case 'SET_STATUS': return await this.setStatus(this.body.status);
      case 'DELETE_PROOF_OF_PAYMENT': return await this.deleteProofOfPayment();
      case 'SET_SPOT': return await this.setSpot(this.body.spotId);
      default: throw new HandledError('Unsupported action');
    }
  }

  protected async deleteResource(): Promise<void> {
    if (this.registration.userId !== this.galaxyUser.userId && !this.managedEvent.canUserManage(this.galaxyUser)) {
      throw new HandledError('Unauthorized');
    }

    // Optional: Delete proof of payment from S3 if it exists
    if (this.registration.proofOfPayment?.key) {
      try {
        await s3.deleteObject({
          bucket: S3_BUCKET_MEDIA,
          key: this.registration.proofOfPayment.key
        });
      } catch (err) {
        console.error('Failed to delete S3 resource on registration delete', err);
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

  private validateStatusTransition(nextStatus: RegistrationStatus): void {
    const currentStatus = this.registration.status;

    // No-op if they are assigning the exact same status
    if (currentStatus === nextStatus) return;

    let allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus];

    // PAID -> APPROVED transition is allowed only if there is no proof of payment uploaded
    if (currentStatus === RegistrationStatus.PAID && nextStatus === RegistrationStatus.APPROVED) {
      if (this.registration.proofOfPayment) allowedNext = [];
    }

    if (!allowedNext || !allowedNext.includes(nextStatus)) {
      throw new HandledError(`Forbidden status change: Cannot transition from ${currentStatus} to ${nextStatus}`);
    }
  }

  private async setStatus(status: RegistrationStatus): Promise<ERSRegistration> {
    if (this.registration.userId !== this.galaxyUser.userId && !this.managedEvent.canUserManage(this.galaxyUser)) {
      throw new HandledError('Unauthorized');
    }

    this.validateStatusTransition(status);

    // Spot Limit Check
    if (status === RegistrationStatus.APPROVED || status === RegistrationStatus.CONFIRMED) {
      const spot = this.managedEvent.spots.find(s => s.id === this.registration.spotId);
      if (spot && spot.limit) {
        const regs = await ddb.query({
          TableName: DDB_TABLES.registrations,
          KeyConditionExpression: 'eventId = :eventId',
          ExpressionAttributeValues: { ':eventId': this.managedEvent.eventId }
        });
        const spotCount = regs.filter(r =>
          r.spotId === this.registration.spotId &&
          r.registrationId !== this.registration.registrationId &&
          [RegistrationStatus.APPROVED, RegistrationStatus.PAID, RegistrationStatus.CONFIRMED].includes(r.status)
        ).length;
        if (spotCount >= spot.limit) throw new HandledError(`Spot limit exceeded: ${spot.name}`);
      }
    }

    if (status === RegistrationStatus.APPROVED && this.registration.invoiceNumber === undefined) {
      this.managedEvent.receiptsCounter = (this.managedEvent.receiptsCounter || 0) + 1;
      this.registration.invoiceNumber = this.managedEvent.receiptsCounter;
      this.registration.approvedAt = new Date().toISOString();
      await ddb.put({ TableName: DDB_TABLES.events, Item: this.managedEvent });
    }

    const oldStatus = this.registration.status;
    this.registration.status = status;
    this.registration.updatedAt = new Date().toISOString();
    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });

    if (oldStatus !== status) {
      let emailType: string;
      switch (status) {
        case RegistrationStatus.APPROVED:
          emailType = 'REGISTRATION_APPROVED';
          break;
        case RegistrationStatus.REJECTED:
          emailType = 'REGISTRATION_REJECTED';
          break;
        case RegistrationStatus.CONFIRMED:
          emailType = 'PAYMENT_CONFIRMED';
          break;
        default:
          emailType = 'STATUS_CHANGED';
          break;
      }

      if (emailType != null) {
        await this.sendEmail(emailType);
      }
    }

    return this.registration;
  }

  private async setSpot(spotId: string): Promise<ERSRegistration> {
    const spot = this.managedEvent.spots.find(s => s.id === spotId);
    if (!spot) throw new HandledError('Invalid spot');

    // If registration is active (APPROVED, PAID, CONFIRMED), check spot limit
    if ([RegistrationStatus.APPROVED, RegistrationStatus.PAID, RegistrationStatus.CONFIRMED].includes(this.registration.status)) {
      if (spot.limit) {
        const regs = await ddb.query({
          TableName: DDB_TABLES.registrations,
          KeyConditionExpression: 'eventId = :eventId',
          ExpressionAttributeValues: { ':eventId': this.managedEvent.eventId }
        });
        const spotCount = regs.filter(r =>
          r.spotId === spotId &&
          r.registrationId !== this.registration.registrationId &&
          [RegistrationStatus.APPROVED, RegistrationStatus.PAID, RegistrationStatus.CONFIRMED].includes(r.status)
        ).length;
        if (spotCount >= spot.limit) throw new HandledError(`Spot limit exceeded: ${spot.name}`);
      }
    }

    const oldSpotId = this.registration.spotId;
    this.registration.spotId = spotId;
    this.registration.updatedAt = new Date().toISOString();
    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });

    if (oldSpotId !== spotId) {
      await this.sendEmail('SPOT_CHANGED');
    }

    return this.registration;
  }

  private async getProofOfPaymentUploadUrl(): Promise<any> {
    if (this.registration.userId !== this.galaxyUser.userId) throw new HandledError('Unauthorized');
    if (this.registration.status !== RegistrationStatus.APPROVED) throw new HandledError('Cannot upload proof of payment in this status');

    const extension = this.body.extension ? `.${this.body.extension}` : '';
    const key = `${S3_ATTACHMENTS_FOLDER}/events/${this.managedEvent.eventId}/proof-of-payments/${this.registration.registrationId}/${Date.now()}_proof_of_payment${extension}`;
    const url = await s3.signedURLPut(S3_BUCKET_MEDIA, key);
    return { url: url.url, key };
  }

  private async getProofOfPaymentDownloadUrl(): Promise<any> {
    if (this.registration.userId !== this.galaxyUser.userId && !this.managedEvent.canUserManage(this.galaxyUser)) {
      throw new HandledError('Unauthorized');
    }

    if (!this.registration.proofOfPayment?.key) throw new HandledError('No proof of payment found');

    const extensionMatch = this.registration.proofOfPayment.key.match(/\.[0-9a-z]+$/i);
    const extension = extensionMatch ? extensionMatch[0] : '';
    const filename = `${this.registration.subject.name.replace(/\s+/g, '_')}_proof_of_payment${extension}`;
    return await s3.signedURLGet(S3_BUCKET_MEDIA, this.registration.proofOfPayment.key, { filename });
  }

  private async submitProofOfPayment(): Promise<ERSRegistration> {
    if (this.registration.userId !== this.galaxyUser.userId) throw new HandledError('Unauthorized');
    if (!this.body.proofOfPaymentKey) throw new HandledError('Missing proof of payment key');

    const key = this.body.proofOfPaymentKey;

    // Verify existence in S3
    const exists = await s3.doesObjectExist({
      bucket: S3_BUCKET_MEDIA,
      key
    });
    if (!exists) throw new HandledError('Proof of payment file not found in storage');

    this.setStatus(RegistrationStatus.PAID);
    this.registration.updatedAt = new Date().toISOString();
    this.registration.proofOfPayment = new ProofOfPayment({
      key,
      uploadedAt: new Date().toISOString()
    });

    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });
    return this.registration;
  }

  private async deleteProofOfPayment(): Promise<ERSRegistration> {
    if (this.registration.userId !== this.galaxyUser.userId && !this.managedEvent.canUserManage(this.galaxyUser)) {
      throw new HandledError('Unauthorized');
    }

    if (!this.registration.proofOfPayment?.key) throw new HandledError('No proof of payment to delete');


    // Delete from S3
    try {
      await s3.deleteObject({
        bucket: S3_BUCKET_MEDIA,
        key: this.registration.proofOfPayment.key
      });
    } catch (err) {
      console.error('Failed to delete S3 resource', err);
      // We continue to clean up the registration state even if S3 delete fails
    }

    // Reset registration state
    delete this.registration.proofOfPayment;
    this.setStatus(RegistrationStatus.APPROVED);
    this.registration.updatedAt = new Date().toISOString();

    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });
    return this.registration;
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
      key: `assets/${details.templateName}.hbs`
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
