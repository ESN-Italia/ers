import { Injectable } from '@angular/core';
import { IDEAApiService } from '@idea-ionic/common';

import { ERSEvent } from '@models/ersEvent.model';
import { ERSRegistration } from '@models/ersRegistration.model';
import { SignedURL } from 'idea-toolbox';

@Injectable({ providedIn: 'root' })
export class ERSEventsService {
  private events: ERSEvent[];

  constructor(private api: IDEAApiService) { }

  /**
   * Load the active events from the back-end.
   */
  private async loadList(force = false): Promise<void> {
    if (this.events && !force) return;
    const events: ERSEvent[] = await this.api.getResource('ers-events');
    this.events = events.map(x => new ERSEvent(x));
  }

  /**
   * Get the list of events.
   */
  async getList(force = false): Promise<ERSEvent[]> {
    await this.loadList(force);
    return this.events ? this.events.slice().sort((a, b) => b.startAt.localeCompare(a.startAt)) : [];
  }

  /**
   * Get an event by its id.
   */
  async getById(eventId: string): Promise<ERSEvent> {
    return new ERSEvent(await this.api.getResource(['ers-events', eventId]));
  }

  /**
   * Insert an event.
   */
  async insert(event: ERSEvent): Promise<ERSEvent> {
    return new ERSEvent(await this.api.postResource('ers-events', { body: event }));
  }

  /**
   * Update an event.
   */
  async update(event: ERSEvent): Promise<ERSEvent> {
    return new ERSEvent(
      await this.api.putResource(['ers-events', event.eventId], { body: event })
    );
  }

  /**
   * Archive an event.
   */
  async archive(event: ERSEvent): Promise<void> {
    await this.api.patchResource(['ers-events', event.eventId], { body: { action: 'ARCHIVE' } });
  }

  /**
   * Unarchive an event.
   */
  async unarchive(event: ERSEvent): Promise<void> {
    await this.api.patchResource(['ers-events', event.eventId], { body: { action: 'UNARCHIVE' } });
  }

  /**
   * Delete an event.
   */
  async delete(event: ERSEvent): Promise<void> {
    await this.api.deleteResource(['ers-events', event.eventId]);
  }

  // --- Registration Methods ---

  /**
   * Get registrations for an event.
   * If user is manager, returns all. If regular user, returns own.
   */
  async getRegistrations(eventId: string): Promise<ERSRegistration[]> {
    const regs: any[] = await this.api.getResource(['ers-events', eventId, 'registrations']);
    return regs.map(x => new ERSRegistration(x));
  }

  /**
   * Get a specific registration.
   */
  async getRegistration(eventId: string, registrationId: string): Promise<ERSRegistration> {
    return new ERSRegistration(await this.api.getResource(['ers-events', eventId, 'registrations', registrationId]));
  }

  /**
   * Submit a registration.
   */
  async register(registration: ERSRegistration): Promise<ERSRegistration> {
    return new ERSRegistration(await this.api.postResource(['ers-events', registration.eventId, 'registrations'], { body: registration }));
  }

  /**
   * Update a registration.
   */
  async updateRegistration(registration: ERSRegistration): Promise<ERSRegistration> {
    return new ERSRegistration(
      await this.api.putResource(['ers-events', registration.eventId, 'registrations', registration.registrationId], { body: registration })
    );
  }

  /**
   * Approve a spot (Manager).
   */
  async approveSpot(eventId: string, registrationId: string): Promise<void> {
    await this.api.patchResource(['ers-events', eventId, 'registrations', registrationId], { body: { action: 'APPROVE' } });
  }

  /**
   * Reject a spot (Manager).
   */
  async rejectSpot(eventId: string, registrationId: string): Promise<void> {
    await this.api.patchResource(['ers-events', eventId, 'registrations', registrationId], { body: { action: 'REJECT' } });
  }

  /**
   * Confirm payment (Manager).
   */
  async confirmPayment(eventId: string, registrationId: string): Promise<void> {
    await this.api.patchResource(['ers-events', eventId, 'registrations', registrationId], { body: { action: 'CONFIRM_PAYMENT' } });
  }

  /**
   * Get receipt upload URL.
   */
  async getReceiptUploadUrl(eventId: string, registrationId: string): Promise<SignedURL> {
    return await this.api.patchResource(['ers-events', eventId, 'registrations', registrationId], { body: { action: 'receipt-upload-url' } });
  }

  /**
   * Submit receipt (notify backend after upload).
   */
  async submitReceipt(eventId: string, registrationId: string, receiptKey: string): Promise<void> {
    await this.api.patchResource(['ers-events', eventId, 'registrations', registrationId], {
      body: { action: 'SUBMIT_RECEIPT', receiptKey }
    });
  }

  /**
   * Delete receipt.
   */
  async deleteReceipt(eventId: string, registrationId: string): Promise<void> {
    await this.api.patchResource(['ers-events', eventId, 'registrations', registrationId], {
      body: { action: 'DELETE_RECEIPT' }
    });
  }
}
