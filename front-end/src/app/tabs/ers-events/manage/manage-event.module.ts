import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { IDEATranslationsModule } from '@idea-ionic/common';

import { ManageEventPageRoutingModule } from './manage-event-routing.module';
import { ManageEventPage } from './manage-event.page';

import { EditModeButtonsModule } from '@common/editModeButtons.module';
import { HTMLEditorModule } from '@common/htmlEditor.module';
import { DatetimeWithTimezoneStandaloneComponent } from '@common/datetimeWithTimezone';
import { QuestionEditorComponent } from './question-editor/question-editor.component';
import { BulkDeleteComponent } from './bulk-delete/bulk-delete.component';
import { InvoiceEditorComponent } from './invoice-editor/invoice-editor.component';
import { OptionalTicketEditorComponent } from './optional-ticket-editor/optional-ticket-editor.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ManageEventPageRoutingModule,
    IDEATranslationsModule,
    EditModeButtonsModule,
    HTMLEditorModule,
    DatetimeWithTimezoneStandaloneComponent,
    QuestionEditorComponent,
    BulkDeleteComponent,
    InvoiceEditorComponent,
    OptionalTicketEditorComponent
  ],
  declarations: [ManageEventPage]
})
export class ManageEventPageModule { }
