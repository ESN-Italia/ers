///
/// IMPORTS
///

import { DynamoDB, GenericController, HandledError, S3 } from 'idea-aws';

///
/// CONSTANTS, ENVIRONMENT VARIABLES, HANDLER
///

const DDB_TABLES = { topics: process.env.DDB_TABLE_topics, opportunities: process.env.DDB_TABLE_opportunities };
const ddb = new DynamoDB();

export const handler = async (ev: any, _: any, cb: any): Promise<void> =>
  await new ScheduledOps(ev, cb).handleRequest();

class ScheduledOps extends GenericController {
  async handleRequest(): Promise<void> {
    try {
      await Promise.all([this.closeTopicsWithPastDeadline(), this.closeOpportunitiesWithPastDeadline(), this.deleteExpiredReceipts()]);
      this.done(null);
    } catch (error) {
      this.logger.error('Failed scheduled ops', error);
      this.done(new HandledError('ERROR IN SCHEDULED OPS'));
    }
  }
  private async closeTopicsWithPastDeadline(): Promise<void> {
    const now = new Date().toISOString();
    const topics = await ddb.scan({ TableName: DDB_TABLES.topics, IndexName: 'topicId-willCloseAt-index' });
    const topicsToClose = topics.filter(t => t.willCloseAt < now);

    for (const topic of topicsToClose) {
      try {
        await ddb.update({
          TableName: DDB_TABLES.topics,
          Key: { topicId: topic.topicId },
          UpdateExpression: 'SET closedAt = :deadline REMOVE willCloseAt',
          ExpressionAttributeValues: { ':deadline': topic.willCloseAt }
        });
      } catch (error) {
        this.logger.warn('Topic NOT closed', error, { topic });
      }
    }
  }
  private async closeOpportunitiesWithPastDeadline(): Promise<void> {
    const now = new Date().toISOString();
    const opportunities = await ddb.scan({
      TableName: DDB_TABLES.opportunities,
      IndexName: 'opportunityId-willCloseAt-index'
    });
    const opportunitiesToClose = opportunities.filter(x => x.willCloseAt < now);

    for (const opportunity of opportunitiesToClose) {
      try {
        await ddb.update({
          TableName: DDB_TABLES.opportunities,
          Key: { opportunityId: opportunity.opportunityId },
          UpdateExpression: 'SET closedAt = :deadline REMOVE willCloseAt',
          ExpressionAttributeValues: { ':deadline': opportunity.willCloseAt }
        });
      } catch (error) {
        this.logger.warn('Opportunity NOT closed', error, { opportunity });
      }
    }
  }

  private async deleteExpiredReceipts(): Promise<void> {
    const now = new Date();
    const retentionPeriodDays = 90;
    const cutoffDate = new Date(now.setDate(now.getDate() - retentionPeriodDays)).toISOString();

    // Scan events that ended more than 90 days ago and haven't had receipts deleted yet
    // Note: This scan might be expensive if many events. Ideally we'd use an index or a different approach,
    // but for the scale of this app (ESN Assembly), full scan of events is likely acceptable.
    // Events table is not expected to be huge.
    // Also, we don't have an index on endAt.
    const events = await ddb.scan({ TableName: process.env.DDB_TABLE_events });
    const eventsToClean = events.filter((e: any) => e.endAt < cutoffDate && !e.receiptsDeleted);

    const s3 = new S3();
    const MEDIA_BUCKET = process.env.S3_BUCKET_MEDIA;

    for (const event of eventsToClean) {
      try {
        // Get registrations with receipts
        const registrations = await ddb.query({
          TableName: process.env.DDB_TABLE_registrations,
          KeyConditionExpression: 'eventId = :eventId',
          ExpressionAttributeValues: { ':eventId': event.eventId }
        });
        const regsWithReceipts = registrations.filter((r: any) => r.receipt);

        for (const reg of regsWithReceipts) {
          if (reg.receipt.key) { // Assuming we stored key in receipt object
            try {
              await s3.deleteObject({bucket: MEDIA_BUCKET, key: reg.receipt.key});
              // Update registration to remove receipt link?
              // Optional: keeps history that receipt was there but file is gone.
              // Or just set receipt = null.
              await ddb.update({
                TableName: process.env.DDB_TABLE_registrations,
                Key: { eventId: event.eventId, registrationId: reg.registrationId },
                UpdateExpression: 'REMOVE receipt'
              });
            } catch (e) {
              this.logger.warn('Failed to delete receipt', e, { key: reg.receipt.key });
            }
          }
        }

        // Mark event as cleaned
        await ddb.update({
          TableName: process.env.DDB_TABLE_events,
          Key: { eventId: event.eventId },
          UpdateExpression: 'SET receiptsDeleted = :true',
          ExpressionAttributeValues: { ':true': true }
        });

      } catch (error) {
        this.logger.error('Failed to clean event receipts', error, { eventId: event.eventId });
      }
    }
  }
}
