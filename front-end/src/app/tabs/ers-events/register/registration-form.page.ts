import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IDEALoadingService, IDEAMessageService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { ERSEventsService } from '../ers-events.service';
import { ERSEvent, QuestionType } from '@models/ersEvent.model';
import { ERSRegistration } from '@models/ersRegistration.model';

@Component({
  selector: 'app-registration-form',
  templateUrl: './registration-form.page.html',
  styleUrls: ['./registration-form.page.scss']
})
export class RegistrationFormPage implements OnInit {
  eventId: string;
  event: ERSEvent;
  registration: ERSRegistration;
  QuestionType = QuestionType;

  constructor(
    private route: ActivatedRoute,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private service: ERSEventsService,
    public app: AppService
  ) { }

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
      const existing = regs.find(r => r.userId === this.app.user.userId);

      if (existing) {
        this.registration = existing;
      } else {
        this.registration = new ERSRegistration({
          eventId: this.eventId,
          userId: this.app.user.userId,
          answers: {}
        });
        if (this.event.spots?.length === 1) {
          this.registration.spotId = this.event.spots[0].id;
        }
      }

      // Initialize missing answers as arrays for checkboxes
      this.event.questions?.forEach(q => {
        if (q.type === QuestionType.CHECKBOX && !Array.isArray(this.registration.answers[q.id])) {
          this.registration.answers[q.id] = this.registration.answers[q.id] ? (this.registration.answers[q.id] as string).split(',') : [];
        }
      });

    } catch (err) {
      this.message.error('COMMON.NOT_FOUND');
    } finally {
      this.loading.hide();
    }
  }

  async submit(): Promise<void> {
    // Validate
    const errors = this.registration.validate(this.event);
    if (errors.length) return this.message.error('COMMON.FORM_HAS_ERROR_TO_CHECK');

    try {
      await this.loading.show();
      if (this.registration.registrationId) {
        await this.service.updateRegistration(this.registration);
      } else {
        await this.service.register(this.registration);
      }
      this.message.success('COMMON.OPERATION_COMPLETED');
      this.app.goToInTabs(['ers-events', this.eventId, 'registration'], { root: true }); // Go to details
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  isCheckboxChecked(questionId: string, option: string): boolean {
    const answers = this.registration.answers[questionId];
    return Array.isArray(answers) && answers.includes(option);
  }

  toggleCheckbox(questionId: string, option: string): void {
    if (!Array.isArray(this.registration.answers[questionId])) {
      this.registration.answers[questionId] = [];
    }
    const answers = this.registration.answers[questionId] as string[];
    const index = answers.indexOf(option);
    if (index === -1) answers.push(option);
    else answers.splice(index, 1);
  }
}
