import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { IDEATranslationsModule } from '@idea-ionic/common';

import { ERSEventsPageRoutingModule } from './ers-events-routing.module';
import { ERSEventsPage } from './ers-events.page';
import { ERSEventComponent } from './ers-event/ers-event.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ERSEventsPageRoutingModule,
    IDEATranslationsModule
  ],
  declarations: [ERSEventsPage, ERSEventComponent]
})
export class ERSEventsPageModule { }
