import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { AlertController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { ERSEventsService } from '../ers-events.service';
import { ERSEvent, EventSpot, EventQuestion } from '@models/ersEvent.model';

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

  constructor(
    private route: ActivatedRoute,
    privatelocation: Location,
    private alertCtrl: AlertController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private t: IDEATranslationsService,
    private service: ERSEventsService,
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
        this.event.questions = [];
        this.event.managers = [this.app.user.userId];
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
      { name: 'price', type: 'number', placeholder: this.t._('ERS_EVENTS.SPOT_PRICE') },
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

  async addQuestion(): Promise<void> {
    const doAdd = async ({ text, type, options, required }): Promise<void> => {
      if (!text) return;
      const question = new EventQuestion({
        id: Date.now().toString(),
        text,
        type,
        options: options ? options.split(',').map(o => o.trim()).filter(o => o) : [],
        required: Boolean(required)
      });
      this.event.questions.push(question);
    };

    const header = this.t._('ERS_EVENTS.ADD_QUESTION');
    const inputs: any = [
      { name: 'text', type: 'text', placeholder: this.t._('ERS_EVENTS.QUESTION_TEXT') },
      {
        name: 'type', type: 'radio', label: this.t._('ERS_EVENTS.TEXT'), value: 'text', checked: true
      },
      {
        name: 'type', type: 'radio', label: this.t._('ERS_EVENTS.RADIOBOX'), value: 'radiobox'
      },
      {
        name: 'type', type: 'radio', label: this.t._('ERS_EVENTS.CHECKBOX'), value: 'checkbox'
      },
      { name: 'options', type: 'text', placeholder: this.t._('ERS_EVENTS.OPTIONS_COMMA_SEP') },
      { name: 'required', type: 'checkbox', label: this.t._('ERS_EVENTS.REQUIRED'), checked: false }
    ];
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.ADD'), handler: doAdd }
    ];

    const alert = await this.alertCtrl.create({ header, inputs, buttons });
    await alert.present();
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
      if (this.event.managers.includes(userId)) return;
      this.event.managers.push(userId);
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
    const index = this.event.managers.indexOf(userId);
    if (index !== -1) this.event.managers.splice(index, 1);
  }
}

export enum UXMode {
  VIEW,
  INSERT,
  EDIT
}
