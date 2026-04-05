import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { IDEATranslationsModule } from '@idea-ionic/common';

import { ERSEvent, EventQuestion, QuestionType } from '@models/ersEvent.model';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, IDEATranslationsModule],
  selector: 'app-question-editor',
  templateUrl: './question-editor.component.html',
  styleUrls: ['./question-editor.component.scss']
})
export class QuestionEditorComponent implements OnInit {
  @Input() question?: EventQuestion;
  @Input() event: ERSEvent;

  localQuestion: EventQuestion;
  isEdit = false;
  optionsString = '';
  conditionType: 'none' | 'spot' | 'question' | 'ticket' = 'none';

  QuestionType = QuestionType;

  constructor(private modalCtrl: ModalController) {}

  ngOnInit(): void {
    if (this.question) {
      this.isEdit = true;
      // Copy to avoid live editing the original object before clicking "Save"
      this.localQuestion = new EventQuestion({ ...this.question });
      this.optionsString = (this.localQuestion.options || []).join(', ');
      
      if (this.localQuestion.spotIdCondition) {
        this.conditionType = 'spot';
      } else if (this.localQuestion.dependsOnQuestionId) {
        this.conditionType = 'question';
      } else if (this.localQuestion.optionalTicketIdCondition) {
        this.conditionType = 'ticket';
      }
    } else {
      this.localQuestion = new EventQuestion({
        id: Date.now().toString(),
        text: '',
        type: QuestionType.TEXT,
        options: [],
        required: false
      });
    }
  }

  get showOptions(): boolean {
    return this.localQuestion.type === QuestionType.RADIOBOX || this.localQuestion.type === QuestionType.CHECKBOX;
  }

  updateOptions(val: string): void {
    this.optionsString = val;
    this.localQuestion.options = val.split(',').map(o => o.trim()).filter(o => o);
  }

  onConditionTypeChange(): void {
    if (this.conditionType !== 'spot') this.localQuestion.spotIdCondition = undefined;
    if (this.conditionType !== 'question') {
      this.localQuestion.dependsOnQuestionId = undefined;
      this.localQuestion.dependsOnAnswer = undefined;
    }
    if (this.conditionType !== 'ticket') this.localQuestion.optionalTicketIdCondition = undefined;
  }

  get availableParentQuestions(): EventQuestion[] {
    // A question can only depend on questions that appear BEFORE it in the list to avoid circular dependencies
    const currentIndex = this.event.questions.findIndex(q => q.id === this.localQuestion.id);
    if (currentIndex === -1) return this.event.questions; // For new questions, all current questions are available
    return this.event.questions.slice(0, currentIndex);
  }

  get parentHasOptions(): boolean {
    const parent = this.event.questions.find(q => q.id === this.localQuestion.dependsOnQuestionId);
    return parent && (parent.type === QuestionType.RADIOBOX || parent.type === QuestionType.CHECKBOX);
  }

  get parentOptions(): string[] {
    const parent = this.event.questions.find(q => q.id === this.localQuestion.dependsOnQuestionId);
    return parent ? parent.options || [] : [];
  }

  onParentQuestionChange(): void {
    this.localQuestion.dependsOnAnswer = undefined;
  }

  isValid(): boolean {
    if (!this.localQuestion.text || !this.localQuestion.type) return false;
    if (this.showOptions && (!this.localQuestion.options || this.localQuestion.options.length === 0)) return false;
    
    if (this.conditionType === 'spot' && !this.localQuestion.spotIdCondition) return false;
    if (this.conditionType === 'question' && (!this.localQuestion.dependsOnQuestionId || !this.localQuestion.dependsOnAnswer)) return false;
    if (this.conditionType === 'ticket' && !this.localQuestion.optionalTicketIdCondition) return false;

    return true;
  }

  save(): void {
    if (this.isValid()) {
      this.modalCtrl.dismiss(this.localQuestion);
    }
  }

  close(): void {
    this.modalCtrl.dismiss();
  }
}
