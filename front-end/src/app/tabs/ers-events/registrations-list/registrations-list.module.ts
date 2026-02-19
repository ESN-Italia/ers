import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { IDEATranslationsModule } from '@idea-ionic/common';

import { RegistrationsListPageRoutingModule } from './registrations-list-routing.module';
import { RegistrationsListPage } from './registrations-list.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RegistrationsListPageRoutingModule,
    IDEATranslationsModule
  ],
  declarations: [RegistrationsListPage]
})
export class RegistrationsListPageModule { }
