import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, ModalController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { MediaService } from '@app/common/media.service';
import { ERSEventsService } from '../ers-events.service';
import { ERSEvent, EventSpot, EventQuestion, EventOptionalTicket, QuestionType, EventType } from '@models/ersEvent.model';
import { QuestionEditorComponent } from './question-editor/question-editor.component';

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
  ) { }

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
      this.loading.hide();
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
      this.loading.hide();
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
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      if (target) target.value = '';
      this.loading.hide();
    }
  }

  enterEditMode(): void {
    this.entityBeforeChange = new ERSEvent(this.event);
    this.editMode = UXMode.EDIT;
  }

  exitEditMode(): void {
    if (this.editMode === UXMode.INSERT) this.app.goToInTabs(['ers-events'], { back: true });
    else {
      this.event = this.entityBeforeChange;
      this.errors = new Set<string>();
      this.editMode = UXMode.VIEW;
    }
  }

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

  async removeSpot(spot: EventSpot): Promise<void> {
    const doRemove = (): void => {
      const index = this.event.spots.indexOf(spot);
      if (index !== -1) this.event.spots.splice(index, 1);
    };

    const header = this.t._('COMMON.ARE_YOU_SURE');
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.REMOVE'), role: 'destructive', handler: doRemove }
    ];
    const alert = await this.alertCtrl.create({ header, buttons });
    alert.present();
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

  async removeOptionalTicket(ticket: EventOptionalTicket): Promise<void> {
    const doRemove = (): void => {
      if (!this.event.optionalTickets) return;
      const index = this.event.optionalTickets.indexOf(ticket);
      if (index !== -1) this.event.optionalTickets.splice(index, 1);
    };

    const header = this.t._('COMMON.ARE_YOU_SURE');
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.REMOVE'), role: 'destructive', handler: doRemove }
    ];
    const alert = await this.alertCtrl.create({ header, buttons });
    alert.present();
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

  async removeQuestion(question: EventQuestion): Promise<void> {
    const doRemove = (): void => {
      const index = this.event.questions.indexOf(question);
      if (index !== -1) this.event.questions.splice(index, 1);
    };

    const header = this.t._('COMMON.ARE_YOU_SURE');
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.REMOVE'), role: 'destructive', handler: doRemove }
    ];
    const alert = await this.alertCtrl.create({ header, buttons });
    alert.present();
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
        this.loading.hide();
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
      this.loading.hide();
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
      this.loading.hide();
    }
  }
}

export enum UXMode {
  VIEW,
  INSERT,
  EDIT
}
