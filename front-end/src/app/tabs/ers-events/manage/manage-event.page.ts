import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, ModalController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { MediaService } from '@app/common/media.service';
import { ERSEventsService } from '../ers-events.service';
import { ERSEvent, EventSpot, EventQuestion, EventOptionalTicket, QuestionType, EventType } from '@models/ersEvent.model';
import { QuestionEditorComponent } from './question-editor/question-editor.component';
import { BulkDeleteComponent } from './bulk-delete/bulk-delete.component';
import { addIcons } from 'ionicons';
import { archive, cloudUploadOutline, copy, createOutline, linkOutline, openOutline, refresh, trash } from 'ionicons/icons';


@Component({
  selector: 'app-manage-event',
  templateUrl: './manage-event.page.html',
  styleUrls: ['./manage-event.page.scss']
})
export class ManageEventPage implements OnInit {
  eventId: string;
  event: ERSEvent;

  editMode = UXMode.VIEW;
  UXMode = UXMode;
  errors = new Set<string>();
  entityBeforeChange: ERSEvent;
  timezones = (Intl as any).supportedValuesOf('timeZone');
  EventType = EventType;
  now = new Date().toISOString();

  constructor(
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private modalCtrl: ModalController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private t: IDEATranslationsService,
    private service: ERSEventsService,
    private _media: MediaService,
    public app: AppService
  ) {
    addIcons({ archive, cloudUploadOutline, copy, createOutline, linkOutline, openOutline, refresh, trash });
  }

  async ngOnInit(): Promise<void> {
    this.eventId = this.route.snapshot.paramMap.get('eventId');
  }

  async ionViewWillEnter(): Promise<void> {
    try {
      await this.loading.show();

      if (this.eventId && this.eventId !== 'new') {
        this.event = await this.service.getById(this.eventId);
        if (!this.event.canUserManage(this.app.user)) return this.app.closePage('COMMON.UNAUTHORIZED');
        this.editMode = UXMode.VIEW;
      } else {
        if (!this.app.user.isAdministrator && !this.app.user.canManageERSEvents) return this.app.closePage('COMMON.UNAUTHORIZED');
        this.event = new ERSEvent({});
        this.event.spots = [];
        this.event.optionalTickets = [];
        this.event.questions = [];
        this.event.additionalManagersIds = [];
        this.event.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        this.editMode = UXMode.INSERT;
      }
    } catch (error) {
      this.message.error('COMMON.NOT_FOUND');
    } finally {
      await this.loading.hide();
    }
  }

  async save(): Promise<void> {
    this.errors = new Set(this.event.validate());
    if (this.errors.size) return this.message.error('COMMON.FORM_HAS_ERROR_TO_CHECK');

    try {
      await this.loading.show();
      let result: ERSEvent;
      if (this.editMode === UXMode.INSERT) result = await this.service.insert(this.event);
      else result = await this.service.update(this.event);

      this.event.load(result);
      if (this.editMode === UXMode.INSERT) {
        // Update URL without reload? Or just navigate.
        // Reuse location.replaceState logic from duplicate call if useful, or just navigate.
        // Angular router navigate is cleaner but might reload component.
        // Let's just switch mode.
        this.eventId = this.event.eventId;
      }
      this.editMode = UXMode.VIEW;
      this.message.success('COMMON.OPERATION_COMPLETED');
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      await this.loading.hide();
    }
  }

  hasFieldAnError(field: string): boolean {
    return this.errors.has(field);
  }

  browseImagesForElementId(elementId: string): void {
    document.getElementById(elementId).click();
  }

  async uploadImage({ target }): Promise<void> {
    const file = target.files[0];
    if (!file) return;

    try {
      await this.loading.show();
      const imageURI = await this._media.uploadImage(file);
      this.event.imageURL = this.app.getImageURLByURI(imageURI);
    } catch (error) {
      this.message.error(error.message, true);
    } finally {
      if (target) target.value = '';
      await this.loading.hide();
    }
  }

  removeImage(): void {
    this.event.imageURL = null;
  }

  enterEditMode(): void {
    this.entityBeforeChange = new ERSEvent(this.event);
    this.editMode = UXMode.EDIT;
  }

  exitEditMode(): void {
    if (this.editMode === UXMode.INSERT) this.app.goToInTabs(['ers-events'], { back: true });
    else {
      this.event.load(this.entityBeforeChange);
      this.errors = new Set<string>();
      this.editMode = UXMode.VIEW;
    }
  }

  trackByQuestionId(_: number, q: EventQuestion): string { return q.id; }
  trackBySpotId(_: number, s: EventSpot): string { return s.id; }
  trackByTicketId(_: number, t: EventOptionalTicket): string { return t.id; }

  async addSpot(): Promise<void> {
    const doAdd = async ({ name, price, limit }): Promise<void> => {
      if (!name || price === undefined || limit === undefined) return;
      const spot = new EventSpot({
        id: Date.now().toString(),
        name,
        price: Number(price),
        limit: Number(limit)
      });
      this.event.spots.push(spot);
    };

    const header = this.t._('ERS_EVENTS.ADD_SPOT');
    const inputs: any = [
      { name: 'name', type: 'text', placeholder: this.t._('ERS_EVENTS.SPOT_NAME') },
      { name: 'price', type: 'number', placeholder: this.t._('ERS_EVENTS.PRICE') },
      { name: 'limit', type: 'number', placeholder: this.t._('ERS_EVENTS.SPOT_LIMIT') }
    ];
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.ADD'), handler: doAdd }
    ];

    const alert = await this.alertCtrl.create({ header, inputs, buttons });
    await alert.present();
  }

  async editSpot(spot: EventSpot): Promise<void> {
    const doEdit = async ({ name, price, limit }): Promise<void> => {
      if (!name || price === undefined || limit === undefined) return;
      spot.name = name;
      spot.price = Number(price);
      spot.limit = Number(limit);
    };

    const header = this.t._('ERS_EVENTS.EDIT_SPOT');
    const inputs: any = [
      { name: 'name', type: 'text', placeholder: this.t._('ERS_EVENTS.SPOT_NAME'), value: spot.name },
      { name: 'price', type: 'number', placeholder: this.t._('ERS_EVENTS.PRICE'), value: spot.price },
      { name: 'limit', type: 'number', placeholder: this.t._('ERS_EVENTS.SPOT_LIMIT'), value: spot.limit }
    ];
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.SAVE'), handler: doEdit }
    ];

    const alert = await this.alertCtrl.create({ header, inputs, buttons });
    await alert.present();
  }

  async bulkRemoveSpots(): Promise<void> {
    const items = this.event.spots.map(spot => ({ id: spot.id, label: spot.name }));
    const modal = await this.modalCtrl.create({
      component: BulkDeleteComponent,
      componentProps: { items }
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data?.length) {
      this.event.spots = this.event.spots.filter(spot => !data.includes(spot.id));
    }
  }

  async addOptionalTicket(): Promise<void> {
    const doAdd = async ({ name, description, price }): Promise<void> => {
      if (!name || price === undefined) return;
      const ticket = new EventOptionalTicket({
        id: Date.now().toString(),
        name,
        description: description || '',
        price: Number(price)
      });
      if (!this.event.optionalTickets) this.event.optionalTickets = [];
      this.event.optionalTickets.push(ticket);
    };

    const header = this.t._('ERS_EVENTS.ADD_OPTIONAL_TICKET');
    const inputs: any = [
      { name: 'name', type: 'text', placeholder: this.t._('ERS_EVENTS.NAME') },
      { name: 'description', type: 'text', placeholder: `${this.t._('ERS_EVENTS.DESCRIPTION')}` },
      { name: 'price', type: 'number', placeholder: this.t._('ERS_EVENTS.PRICE') }
    ];
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.ADD'), handler: doAdd }
    ];

    const alert = await this.alertCtrl.create({ header, inputs, buttons });
    await alert.present();
  }

  async editOptionalTicket(ticket: EventOptionalTicket): Promise<void> {
    const doEdit = async ({ name, description, price }): Promise<void> => {
      if (!name || price === undefined) return;
      ticket.name = name;
      ticket.description = description || '';
      ticket.price = Number(price);
    };

    const header = this.t._('ERS_EVENTS.EDIT_OPTIONAL_TICKET');
    const inputs: any = [
      { name: 'name', type: 'text', placeholder: this.t._('ERS_EVENTS.NAME'), value: ticket.name },
      { name: 'description', type: 'text', placeholder: `${this.t._('ERS_EVENTS.DESCRIPTION')}`, value: ticket.description },
      { name: 'price', type: 'number', placeholder: this.t._('ERS_EVENTS.PRICE'), value: ticket.price }
    ];
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.SAVE'), handler: doEdit }
    ];

    const alert = await this.alertCtrl.create({ header, inputs, buttons });
    await alert.present();
  }

  async bulkRemoveOptionalTickets(): Promise<void> {
    const items = this.event.optionalTickets.map(ticket => ({ id: ticket.id, label: ticket.name }));
    const modal = await this.modalCtrl.create({
      component: BulkDeleteComponent,
      componentProps: { items }
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data?.length) {
      this.event.optionalTickets = this.event.optionalTickets.filter(ticket => !data.includes(ticket.id));
    }
  }

  async addQuestion(): Promise<void> {
    await this.openQuestionEditor();
  }

  async openQuestionEditor(question?: EventQuestion): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: QuestionEditorComponent,
      componentProps: { question, event: this.event }
    });

    modal.onDidDismiss().then(({ data }) => {
      if (data) {
        if (question) {
          // Edit: Replace existing
          const index = this.event.questions.findIndex(q => q.id === question.id);
          if (index !== -1) {
            this.event.questions[index] = data;
          }
        } else {
          // Add: push new
          this.event.questions.push(data);
        }
      }
    });

    await modal.present();
  }



  async bulkRemoveQuestions(): Promise<void> {
    const items = this.event.questions.map(q => ({ id: q.id, label: q.text }));
    const modal = await this.modalCtrl.create({
      component: BulkDeleteComponent,
      componentProps: { items }
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data?.length) {
      this.event.questions = this.event.questions.filter(q => !data.includes(q.id));
    }
  }

  async addManager(): Promise<void> {
    const doAdd = async ({ userId }): Promise<void> => {
      if (!userId) return;
      userId = userId.toLowerCase();
      if (this.event.additionalManagersIds.includes(userId)) return;
      this.event.additionalManagersIds.push(userId);
    };

    const header = this.t._('ERS_EVENTS.ADD_MANAGER');
    const message = this.t._('CONFIGURATIONS.ADD_USERS_BY_THEIR_USERNAME');
    const inputs: any = [{ name: 'userId', type: 'text' }];
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.ADD'), handler: doAdd }
    ];

    const alert = await this.alertCtrl.create({ header, message, inputs, buttons });
    await alert.present();
  }

  removeManagerById(userId: string): void {
    const index = this.event.additionalManagersIds.indexOf(userId);
    if (index !== -1) this.event.additionalManagersIds.splice(index, 1);
  }

  getQuestionConditionInfo(q: EventQuestion): string {
    if (q.spotIdCondition) {
      const spot = this.event.spots.find(s => s.id === q.spotIdCondition);
      return `${this.t._('ERS_EVENTS.CONDITION_DISPLAY_SPOT')}: ${spot?.name || '?'}`;
    }
    if (q.optionalTicketIdCondition) {
      const ticket = this.event.optionalTickets.find(t => t.id === q.optionalTicketIdCondition);
      return `${this.t._('ERS_EVENTS.CONDITION_DISPLAY_TICKET')}: ${ticket?.name || '?'}`;
    }
    if (q.dependsOnQuestionId) {
      const parent = this.event.questions.find(pq => pq.id === q.dependsOnQuestionId);
      return `${this.t._('ERS_EVENTS.CONDITION_DISPLAY_QUESTION')}: ${parent?.text || '?'} (${q.dependsOnAnswer})`;
    }
    return '';
  }

  async deleteEvent(): Promise<void> {
    const doDelete = async (): Promise<void> => {
      try {
        await this.loading.show();
        await this.service.delete(this.event);
        this.message.success('COMMON.OPERATION_COMPLETED');
        this.app.goToInTabs(['ers-events'], { back: true });
      } catch (err) {
        this.message.error(err.message, true);
      } finally {
        await this.loading.hide();
      }
    };

    const header = this.t._('COMMON.ARE_YOU_SURE');
    const message = this.t._('ERS_EVENTS.DELETE_EVENT_CONFIRMATION');
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.DELETE'), role: 'destructive', handler: doDelete }
    ];

    const alert = await this.alertCtrl.create({ header, message, buttons });
    await alert.present();
  }

  async archive(): Promise<void> {
    try {
      await this.loading.show();
      await this.service.archive(this.event);
      this.event = await this.service.getById(this.eventId);
      this.message.success('COMMON.OPERATION_COMPLETED');
    } catch (err) {
      this.message.error(err.message, true);
    } finally {
      await this.loading.hide();
    }
  }

  async unarchive(): Promise<void> {
    try {
      await this.loading.show();
      await this.service.unarchive(this.event);
      this.event = await this.service.getById(this.eventId);
      this.message.success('COMMON.OPERATION_COMPLETED');
    } catch (err) {
      this.message.error(err.message, true);
    } finally {
      await this.loading.hide();
    }
  }

  async cloneEvent(): Promise<void> {
    const doClone = async (): Promise<void> => {
      try {
        await this.loading.show();
        const clone = new ERSEvent(this.event);
        clone.eventId = undefined;
        clone.createdAt = new Date().toISOString();
        clone.updatedAt = undefined;
        clone.archivedAt = undefined;
        clone.receiptsCounter = 0;
        clone.proofsOfPaymentDeleted = false;
        clone.name = `${clone.name} - Copy`;

        const result = await this.service.insert(clone);
        this.message.success('COMMON.OPERATION_COMPLETED');
        this.app.goToInTabs(['ers-events', result.eventId, 'manage']);
      } catch (err) {
        this.message.error(err.message, true);
      } finally {
        await this.loading.hide();
      }
    };

    const header = this.t._('COMMON.ARE_YOU_SURE');
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.DUPLICATE'), handler: doClone }
    ];

    const alert = await this.alertCtrl.create({ header, buttons });
    await alert.present();
  }
}

export enum UXMode {
  VIEW,
  INSERT,
  EDIT
}
