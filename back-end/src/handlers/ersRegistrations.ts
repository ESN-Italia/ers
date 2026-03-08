///
/// IMPORTS
///

import { DynamoDB, HandledError, ResourceController, S3, SES } from 'idea-aws';

import { ERSEvent } from '../models/ersEvent.model';
import { ERSRegistration, Receipt, RegistrationStatus } from '../models/ersRegistration.model';
import { Subject } from '../models/subject.model';
import { User } from '../models/user.model';

///
/// CONSTANTS, ENVIRONMENT VARIABLES, HANDLER
///

const PROJECT = process.env.PROJECT;
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

export const handler = (ev: any, _: any, cb: any): Promise<void> => new ERSRegistrationsRC(ev, cb).handleRequest();

///
/// RESOURCE CONTROLLER
///

class ERSRegistrationsRC extends ResourceController {
  galaxyUser: User;
  managedEvent: ERSEvent;
  registration: ERSRegistration;

  constructor(event: any, callback: any) {
    super(event, callback, { resourceId: 'registrationId' });
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
    this.registration.subject = Subject.fromUser(this.galaxyUser);
    this.registration.registrationId = await ddb.IUNID(PROJECT);
    this.registration.status = RegistrationStatus.PENDING;
    this.registration.createdAt = new Date().toISOString();
    delete this.registration.updatedAt;

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
    if (this.body.action === 'receipt-upload-url') return await this.getReceiptUploadUrl();
    if (this.body.action === 'GET_RECEIPT_DOWNLOAD_URL') return await this.getReceiptDownloadUrl();
    if (this.body.action === 'SUBMIT_RECEIPT') return await this.submitReceipt();

    if (!this.managedEvent.canUserManage(this.galaxyUser)) throw new HandledError('Unauthorized');

    switch (this.body.action) {
      case 'APPROVE': return await this.updateStatus(RegistrationStatus.APPROVED, 'REGISTRATION_APPROVED');
      case 'REJECT': return await this.updateStatus(RegistrationStatus.REJECTED, 'REGISTRATION_REJECTED');
      case 'CONFIRM_PAYMENT': return await this.updateStatus(RegistrationStatus.CONFIRMED, 'PAYMENT_CONFIRMED');
      case 'DELETE_RECEIPT': return await this.deleteReceipt();
      case 'SET_STATUS': return await this.setStatus(this.body.status);
      default: throw new HandledError('Unsupported action');
    }
  }

  protected async deleteResource(): Promise<void> {
    if (this.registration.userId !== this.galaxyUser.userId && !this.managedEvent.canUserManage(this.galaxyUser)) {
      throw new HandledError('Unauthorized');
    }

    // Optional: Delete receipt from S3 if it exists
    if (this.registration.receipt?.key) {
      try {
        await s3.deleteObject({
          bucket: S3_BUCKET_MEDIA,
          key: this.registration.receipt.key
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

  private async updateStatus(status: RegistrationStatus, emailType: string): Promise<ERSRegistration> {
    if (this.registration.userId !== this.galaxyUser.userId && !this.managedEvent.canUserManage(this.galaxyUser)) {
      throw new HandledError('Unauthorized');
    }

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
        if (spotCount >= spot.limit) throw new HandledError('Spot is full');
      }
    }

    this.registration.status = status;
    this.registration.updatedAt = new Date().toISOString();
    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });

    await this.sendEmail(emailType);

    return this.registration;
  }

  private async setStatus(status: RegistrationStatus): Promise<ERSRegistration> {
    if (!Object.values(RegistrationStatus).includes(status)) throw new HandledError('Invalid status');
    this.registration.status = status;
    this.registration.updatedAt = new Date().toISOString();
    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });
    return this.registration;
  }

  private async getReceiptUploadUrl(): Promise<any> {
    if (this.registration.userId !== this.galaxyUser.userId) throw new HandledError('Unauthorized');
    if (this.registration.status !== RegistrationStatus.APPROVED) throw new HandledError('Cannot upload receipt in this status');

    const extension = this.body.extension ? `.${this.body.extension}` : '';
    const key = `${S3_ATTACHMENTS_FOLDER}/events/${this.managedEvent.eventId}/receipts/${this.registration.registrationId}/${Date.now()}_receipt${extension}`;
    const url = await s3.signedURLPut(S3_BUCKET_MEDIA, key);
    return { url: url.url, key };
  }

  private async getReceiptDownloadUrl(): Promise<any> {
    if (this.registration.userId !== this.galaxyUser.userId && !this.managedEvent.canUserManage(this.galaxyUser)) {
      throw new HandledError('Unauthorized');
    }

    if (!this.registration.receipt?.key) throw new HandledError('No receipt found');

    const extensionMatch = this.registration.receipt.key.match(/\.[0-9a-z]+$/i);
    const extension = extensionMatch ? extensionMatch[0] : '';
    const filename = `${this.registration.subject.name.replace(/\s+/g, '_')}_receipt${extension}`;
    return await s3.signedURLGet(S3_BUCKET_MEDIA, this.registration.receipt.key, { filename });
  }

  private async submitReceipt(): Promise<ERSRegistration> {
    if (this.registration.userId !== this.galaxyUser.userId) throw new HandledError('Unauthorized');
    if (!this.body.receiptKey) throw new HandledError('Missing receipt key');

    // Verify existence in S3
    const exists = await s3.doesObjectExist({
      bucket: S3_BUCKET_MEDIA,
      key: this.body.receiptKey
    });
    if (!exists) throw new HandledError('Receipt file not found in storage');

    this.registration.status = RegistrationStatus.PAID;
    this.registration.updatedAt = new Date().toISOString();
    this.registration.receipt = new Receipt({
      key: this.body.receiptKey,
      uploadedAt: new Date().toISOString()
    });

    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });
    return this.registration;
  }

  private async deleteReceipt(): Promise<ERSRegistration> {
    if (this.registration.userId !== this.galaxyUser.userId && !this.managedEvent.canUserManage(this.galaxyUser)) {
      throw new HandledError('Unauthorized');
    }

    if (!this.registration.receipt?.key) throw new HandledError('No receipt to delete');

    // Delete from S3
    try {
      await s3.deleteObject({
        bucket: S3_BUCKET_MEDIA,
        key: this.registration.receipt.key
      });
    } catch (err) {
      console.error('Failed to delete S3 resource', err);
      // We continue to clean up the registration state even if S3 delete fails
    }

    // Reset registration state
    delete this.registration.receipt;
    this.registration.status = RegistrationStatus.APPROVED;
    this.registration.updatedAt = new Date().toISOString();

    await ddb.put({ TableName: DDB_TABLES.registrations, Item: this.registration });
    return this.registration;
  }

  private async getSESTemplateName(emailType: string): Promise<string> {
    switch (emailType) {
      case 'REGISTRATION_APPROVED': return 'ers-registration-approved';
      case 'REGISTRATION_REJECTED': return 'ers-registration-rejected';
      case 'PAYMENT_CONFIRMED': return 'ers-payment-confirmed';
      default: throw new HandledError('Template not found');
    }
  }

  private async sendEmail(type: string): Promise<void> {
    if (!this.registration.subject?.email) return;

    const templateName = await this.getSESTemplateName(type);
    const templateData = {
      user: this.registration.subject.name,
      eventName: this.managedEvent.name,
      paymentInfo: this.managedEvent.name + ' ' + (this.managedEvent.paymentInfo || 'No payment info available')
    };

    try {
      await ses.sendTemplatedEmail({
        toAddresses: [this.registration.subject.email],
        template: `${templateName}-${process.env.STAGE}`,
        templateData
      }, {
        source: process.env.SES_SOURCE_ADDRESS,
        sourceArn: process.env.SES_IDENTITY_ARN,
        region: process.env.SES_REGION
      });
    } catch (e) {
      console.error('Failed to send email', e);
      // Don't fail the request if email fails, just log it.
    }
  }
}
