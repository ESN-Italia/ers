import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { IDEATranslationsModule } from '@idea-ionic/common';

import { EventDetailPageRoutingModule } from './event-detail-routing.module';
import { EventDetailPage } from './event-detail.page';

import { AttachmentsModule } from '@common/attachments.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    EventDetailPageRoutingModule,
    IDEATranslationsModule,
    AttachmentsModule
  ],
  declarations: [EventDetailPage]
})
export class EventDetailPageModule { }
