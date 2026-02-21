///
/// IMPORTS
///

import { DynamoDB, HandledError, ResourceController } from 'idea-aws';

import { ERSEvent } from '../models/ersEvent.model';
import { User } from '../models/user.model';

///
/// CONSTANTS, ENVIRONMENT VARIABLES, HANDLER
///

const PROJECT = process.env.PROJECT;
const DDB_TABLES = {
  events: process.env.DDB_TABLE_ersEvents,
  registrations: process.env.DDB_TABLE_ersRegistrations
};
const ddb = new DynamoDB();

export const handler = (ev: any, _: any, cb: any): Promise<void> => new ERSEventsRC(ev, cb).handleRequest();

///
/// RESOURCE CONTROLLER
///

class ERSEventsRC extends ResourceController {
  galaxyUser: User;
  npEvent: ERSEvent;

  constructor(event: any, callback: any) {
    super(event, callback, { resourceId: 'eventId' });
    this.galaxyUser = new User(event.requestContext.authorizer.lambda.user);
  }

  protected async checkAuthBeforeRequest(): Promise<void> {
    if (!this.resourceId) return;

    try {
      this.npEvent = new ERSEvent(await ddb.get({ TableName: DDB_TABLES.events, Key: { eventId: this.resourceId } }));
    } catch (err) {
      throw new HandledError('Event not found');
    }
  }

  protected async getResources(): Promise<ERSEvent[]> {
    let events: ERSEvent[] = await ddb.scan({ TableName: DDB_TABLES.events });
    events = events.map(x => new ERSEvent(x));
    if (!this.queryParams.all) events = events.filter(x => !x.archivedAt);
    return events.sort((a, b): number => a.name.localeCompare(b.name));
  }

  private async putSafeResource(opts: { noOverwrite: boolean }): Promise<ERSEvent> {
    const errors = this.npEvent.validate();
    if (errors.length) throw new HandledError(`Invalid fields: ${errors.join(', ')}`);

    const putParams: any = { TableName: DDB_TABLES.events, Item: this.npEvent };
    if (opts.noOverwrite) putParams.ConditionExpression = 'attribute_not_exists(eventId)';
    else this.npEvent.updatedAt = new Date().toISOString();

    await ddb.put(putParams);

    return this.npEvent;
  }

  protected async postResources(): Promise<ERSEvent> {
    if (!this.npEvent.canUserManage(this.galaxyUser)) throw new HandledError('Unauthorized');

    this.npEvent = new ERSEvent(this.body);
    this.npEvent.eventId = await ddb.IUNID(PROJECT);
    this.npEvent.createdAt = new Date().toISOString();
    delete this.npEvent.updatedAt;

    return await this.putSafeResource({ noOverwrite: true });
  }

  protected async getResource(): Promise<ERSEvent> {
    return this.npEvent;
  }

  protected async putResource(): Promise<ERSEvent> {
    if (!this.npEvent.canUserManage(this.galaxyUser)) throw new HandledError('Unauthorized');

    const oldEvent = new ERSEvent(this.npEvent);
    this.npEvent.safeLoad(this.body, oldEvent);

    return await this.putSafeResource({ noOverwrite: false });
  }

  protected async patchResource(): Promise<ERSEvent> {
    switch (this.body.action) {
      case 'ARCHIVE':
        return await this.manageArchive(true);
      case 'UNARCHIVE':
        return await this.manageArchive(false);
      default:
        throw new HandledError('Unsupported action');
    }
  }

  private async manageArchive(archive: boolean): Promise<ERSEvent> {
    if (!this.npEvent.canUserManage(this.galaxyUser)) throw new HandledError('Unauthorized');

    if (archive) this.npEvent.archivedAt = new Date().toISOString();
    else delete this.npEvent.archivedAt;

    await ddb.put({ TableName: DDB_TABLES.events, Item: this.npEvent });
    return this.npEvent;
  }

  protected async deleteResource(): Promise<void> {
    if (!this.npEvent.canUserManage(this.galaxyUser)) throw new HandledError('Unauthorized');

    // Check if there are registrations
    const regs = await ddb.query({
      TableName: DDB_TABLES.registrations,
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: { ':eventId': this.npEvent.eventId }
    });
    if (regs.length > 0) throw new HandledError('Event has registrations');

    await ddb.delete({ TableName: DDB_TABLES.events, Key: { eventId: this.npEvent.eventId } });
  }
}
