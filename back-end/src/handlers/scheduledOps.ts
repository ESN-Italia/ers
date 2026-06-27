///
/// IMPORTS
///

import { DynamoDB, GenericController, HandledError, S3 } from 'idea-aws';

///
/// CONSTANTS, ENVIRONMENT VARIABLES, HANDLER
///

const DDB_TABLES = { topics: process.env.DDB_TABLE_topics, opportunities: process.env.DDB_TABLE_opportunities };
const ddb = new DynamoDB();

export const handler = async (ev: any): Promise<void> => await new ScheduledOps(ev).handleRequest();

class ScheduledOps extends GenericController {
  async handleRequest(): Promise<void> {
    try {
      await Promise.all([
        // this.deleteExpiredReceipts(),
      ]);
      this.done(null);
    } catch (error) {
      this.logger.error('Failed scheduled ops', error);
      this.done(new HandledError('ERROR IN SCHEDULED OPS'));
    }
  }

  private async deleteExpiredReceipts(): Promise<void> {
    const now = new Date();
    const retentionPeriodDays = 365 * 10;
    const cutoffDate = new Date(now.setDate(now.getDate() - retentionPeriodDays)).toISOString();

    // Scan events that ended more than retentionPeriodDays ago and haven't had receipts deleted yet
    // Note: This scan might be expensive if there are many events. Ideally we'd use an index or a different approach, but for the scale of this app full scan of events is likely acceptable.
    // Events table is not expected to be huge.
    // Also, we don't have an index on endAt.
    const events = await ddb.scan({ TableName: process.env.DDB_TABLE_events });
    const eventsToClean = events.filter((e: any) => e.endAt < cutoffDate && !e.proofsOfPaymentDeleted);

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
              await s3.deleteObject({ bucket: MEDIA_BUCKET, key: reg.receipt.key });
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
          UpdateExpression: 'SET proofsOfPaymentDeleted = :true',
          ExpressionAttributeValues: { ':true': true }
        });

      } catch (error) {
        this.logger.error('Failed to clean event receipts', error, { eventId: event.eventId });
      }
    }
  }
}
