import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { ERSEventsService } from '../ers-events.service';
import { ERSEvent } from '@models/ersEvent.model';
import { ERSRegistration, RegistrationStatus } from '@models/ersRegistration.model';
import { addIcons } from 'ionicons';
import { arrowBack, calendarSharp, create, listOutline, locationSharp } from 'ionicons/icons';


@Component({
  selector: 'app-event-detail',
  templateUrl: './event-detail.page.html',
  styleUrls: ['./event-detail.page.scss']
})
export class EventDetailPage implements OnInit {
  eventId: string;
  event: ERSEvent;
  myRegistration: ERSRegistration;
  now = new Date().toISOString();

  constructor(
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private service: ERSEventsService,
    public app: AppService
  ) {
    addIcons({ arrowBack, calendarSharp, create, listOutline, locationSharp }); }

  async ngOnInit(): Promise<void> {
    this.eventId = this.route.snapshot.paramMap.get('eventId');
  }

  async ionViewWillEnter(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    try {
      await this.loading.show();
      this.event = await this.service.getById(this.eventId);

      const regs = await this.service.getRegistrations(this.eventId);
      this.myRegistration = regs.find(r => r.userId === this.app.user.userId);

    } catch (err) {
      this.message.error('COMMON.NOT_FOUND');
    } finally {
      await this.loading.hide();
    }
  }

  async register(): Promise<void> {
    this.app.goToInTabs(['ers-events', this.eventId, 'register']);
  }

  async viewRegistration(): Promise<void> {
    this.app.goToInTabs(['ers-events', this.eventId, 'registration']);
  }

  async viewRegistrations(): Promise<void> {
    this.app.goToInTabs(['ers-events', this.eventId, 'registrations']);
  }

  async manage(): Promise<void> {
    this.app.goToInTabs(['ers-events', this.eventId, 'manage']);
  }

  goBack(): void {
    this.app.goToInTabs(['ers-events']);
  }
}
