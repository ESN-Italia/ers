import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { IDEATranslationsModule } from '@idea-ionic/common';

import { SubjectModule } from '@app/common/subject.module';

import { RegistrationDetailPageRoutingModule } from './registration-detail-routing.module';
import { RegistrationDetailPage } from './registration-detail.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RegistrationDetailPageRoutingModule,
    IDEATranslationsModule,
    SubjectModule
  ],
  declarations: [RegistrationDetailPage]
})
export class RegistrationDetailPageModule { }
