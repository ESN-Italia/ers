import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { IDEATranslationsModule } from '@idea-ionic/common';

import { ManageEventPageRoutingModule } from './manage-event-routing.module';
import { ManageEventPage } from './manage-event.page';

import { EditModeButtonsModule } from '@common/editModeButtons.module';
import { HTMLEditorModule } from '@common/htmlEditor.module';
import { AttachmentsModule } from '@common/attachments.module';
import { DatetimeWithTimezoneStandaloneComponent } from '@common/datetimeWithTimezone';
import { QuestionEditorComponent } from './question-editor/question-editor.component';
import { BulkDeleteComponent } from './bulk-delete/bulk-delete.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ManageEventPageRoutingModule,
    IDEATranslationsModule,
    EditModeButtonsModule,
    HTMLEditorModule,
    AttachmentsModule,
    DatetimeWithTimezoneStandaloneComponent,
    QuestionEditorComponent,
    BulkDeleteComponent
  ],
  declarations: [ManageEventPage]
})
export class ManageEventPageModule { }
