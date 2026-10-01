import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { IDEATranslationsModule } from '@idea-ionic/common';

import { ERSEvent, EventQuestion, EventQuestionOption, QuestionType } from '@models/ersEvent.model';
import { addIcons } from 'ionicons';
import { addCircleOutline, checkmark, close, trashOutline } from 'ionicons/icons';


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
  newOption = '';
  newOptionPrice: number = null;
  conditionType: 'none' | 'spot' | 'question' = 'none';

  QuestionType = QuestionType;

  constructor(private modalCtrl: ModalController) {
    addIcons({ addCircleOutline, checkmark, close, trashOutline });}

  ngOnInit(): void {
    if (this.question) {
      this.isEdit = true;
      // Deep copy to avoid live editing the original object (and its options) before clicking "Save"
      this.localQuestion = new EventQuestion(JSON.parse(JSON.stringify(this.question)));
      if (!this.localQuestion.options) {
        this.localQuestion.options = [];
      }
      
      if (this.localQuestion.spotIdCondition) {
        this.conditionType = 'spot';
      } else if (this.localQuestion.dependsOnQuestionId) {
        this.conditionType = 'question';
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
    if (!this.localQuestion.invoiceId) this.localQuestion.invoiceId = this.event.getPrimaryInvoice()?.id;
  }

  get showOptions(): boolean {
    return this.localQuestion.hasOptions();
  }

  /**
   * Answers store the option's text, so two options can't share it.
   */
  get canAddOption(): boolean {
    const text = this.newOption?.trim();
    return !!text && !this.localQuestion.options?.some(o => o.text === text) && !(Number(this.newOptionPrice) < 0);
  }

  addOption(): void {
    if (!this.canAddOption) return;
    if (!this.localQuestion.options) this.localQuestion.options = [];
    this.localQuestion.options.push(
      new EventQuestionOption({ text: this.newOption.trim(), price: Number(this.newOptionPrice) || 0 })
    );
    this.newOption = '';
    this.newOptionPrice = null;
  }

  /**
   * The invoice the option prices go to; shown only when some option has a price.
   */
  get showInvoice(): boolean {
    return this.localQuestion.hasPrices() && this.event.getInvoices().length > 1;
  }

  removeOption(index: number): void {
    this.localQuestion.options.splice(index, 1);
  }

  onConditionTypeChange(): void {
    if (this.conditionType !== 'spot') this.localQuestion.spotIdCondition = undefined;
    if (this.conditionType !== 'question') {
      this.localQuestion.dependsOnQuestionId = undefined;
      this.localQuestion.dependsOnAnswer = undefined;
    }
  }

  get availableParentQuestions(): EventQuestion[] {
    // A question can only depend on questions that appear BEFORE it in the list to avoid circular dependencies
    const currentIndex = this.event.questions.findIndex(q => q.id === this.localQuestion.id);
    if (currentIndex === -1) return this.event.questions; // For new questions, all current questions are available
    return this.event.questions.slice(0, currentIndex);
  }

  get parentHasOptions(): boolean {
    const parent = this.event.questions.find(q => q.id === this.localQuestion.dependsOnQuestionId);
    return parent?.hasOptions() ?? false;
  }

  get parentOptions(): string[] {
    const parent = this.event.questions.find(q => q.id === this.localQuestion.dependsOnQuestionId);
    return (parent?.options ?? []).map(o => o.text);
  }

  onParentQuestionChange(): void {
    this.localQuestion.dependsOnAnswer = undefined;
  }

  isValid(): boolean {
    if (!this.localQuestion.text || !this.localQuestion.type) return false;
    if (this.showOptions && (!this.localQuestion.options || this.localQuestion.options.length === 0)) return false;
    if (this.showOptions && this.localQuestion.options.some(o => !(Number(o.price) >= 0))) return false;
    const max = this.localQuestion.maxSelections;
    if (this.localQuestion.type === QuestionType.CHECKBOX && max !== undefined && max !== null && (!Number.isInteger(Number(max)) || Number(max) < 1)) return false;
    if (this.localQuestion.type === QuestionType.FILE && this.localQuestion.maxFileSizeMB !== undefined && this.localQuestion.maxFileSizeMB <= 0) return false;
    
    if (this.conditionType === 'spot' && !this.localQuestion.spotIdCondition) return false;
    if (this.conditionType === 'question' && (!this.localQuestion.dependsOnQuestionId || !this.localQuestion.dependsOnAnswer)) return false;

    return true;
  }

  save(): void {
    if (!this.isValid()) return;
    const q = this.localQuestion;
    if (!q.hasOptions()) {
      q.options = [];
      delete q.description;
    }
    q.options.forEach(o => (o.price = Number(o.price) || 0));
    if (q.type !== QuestionType.CHECKBOX || !q.maxSelections) delete q.maxSelections;
    else q.maxSelections = Number(q.maxSelections);
    // With no priced option the invoice is meaningless; a single invoice is the primary anyway.
    if (!q.hasPrices() || !this.showInvoice) delete q.invoiceId;
    this.modalCtrl.dismiss(new EventQuestion(q));
  }

  close(): void {
    this.modalCtrl.dismiss();
  }
}
