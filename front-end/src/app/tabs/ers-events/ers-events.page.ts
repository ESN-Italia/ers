import { Component } from '@angular/core';

import { AppService } from '@app/app.service';
import { ERSEvent, EventType } from '@models/ersEvent.model';
import { ERSEventsService } from './ers-events.service';
import { addIcons } from 'ionicons';
import { add, archiveOutline } from 'ionicons/icons';


@Component({
  selector: 'app-ers-events',
  templateUrl: './ers-events.page.html',
  styleUrls: ['./ers-events.page.scss']
})
export class ERSEventsPage {
  events: ERSEvent[];
  filteredEvents: ERSEvent[];

  search = '';
  filterByStatus: string = 'ALL';
  filterByType: EventType | 'ALL' = 'ALL';
  showArchived = false;

  EventType = EventType;

  constructor(public app: AppService, private service: ERSEventsService) {
    addIcons({ add, archiveOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    await this.loadList();
  }

  async loadList(event?: any): Promise<void> {
    try {
      this.events = await this.service.getList(true, this.showArchived);
      this.filter();
    } catch (error) {
      this.events = [];
      this.filteredEvents = [];
    }
    if (event) event.target.complete();
  }

  filter(search?: string): void {
    if (search !== undefined) this.search = search;

    let filtered = this.events || [];

    if (this.search) {
      const s = this.search.toLowerCase();
      filtered = filtered.filter(e => e.name.toLowerCase().includes(s));
    }

    if (this.filterByStatus !== 'ALL') {
      const now = new Date().toISOString();
      if (this.filterByStatus === 'OPEN') {
        filtered = filtered.filter(e => e.isRegistrationOpen());
      } else if (this.filterByStatus === 'NOT_OPEN_YET') {
        filtered = filtered.filter(e => !e.isRegistrationOpen() && e.registrationOpenAt && e.registrationOpenAt > now);
      } else if (this.filterByStatus === 'ENDED') {
        filtered = filtered.filter(e => !e.isRegistrationOpen() && e.registrationCloseAt && e.registrationCloseAt < now);
      } else if (this.filterByStatus === 'CLOSED') {
        filtered = filtered.filter(e => !e.isRegistrationOpen() && e.registrationOpenAt && e.registrationOpenAt <= now && (!e.registrationCloseAt || e.registrationCloseAt >= now));
      }
    }

    if (this.filterByType !== 'ALL') {
      filtered = filtered.filter(e => e.type === this.filterByType);
    }

    if (!this.showArchived) {
      filtered = filtered.filter(e => !e.archivedAt);
    } else {
      filtered = filtered.filter(e => !!e.archivedAt);
    }

    filtered.sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));

    this.filteredEvents = filtered;
  }

  async openEvent(event: ERSEvent): Promise<void> {
    this.app.goToInTabs(['ers-events', event.eventId]);
  }

  async viewRegistrations(event: ERSEvent, e: any): Promise<void> {
    if (e) e.stopPropagation();
    this.app.goToInTabs(['ers-events', event.eventId, 'registrations']);
  }

  async createEvent(): Promise<void> {
    // Navigate to create page or open modal
    // For now, let's assume a route 'create' or just 'new'
    // But since I haven't defined 'create' route yet, maybe wait?
    // I'll define 'manage' route for creation/editing.
    this.app.goToInTabs(['ers-events', 'new', 'manage']);
  }
}
