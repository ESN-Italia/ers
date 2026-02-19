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
    DatetimeWithTimezoneStandaloneComponent
  ],
  declarations: [ManageEventPage]
})
export class ManageEventPageModule { }
