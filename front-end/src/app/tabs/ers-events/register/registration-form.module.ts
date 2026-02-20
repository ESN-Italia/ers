import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { IDEATranslationsModule } from '@idea-ionic/common';

import { RegistrationFormPageRoutingModule } from './registration-form-routing.module';
import { RegistrationFormPage } from './registration-form.page';
import { DatetimeWithTimezoneStandaloneComponent } from '@app/common/datetimeWithTimezone';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RegistrationFormPageRoutingModule,
    IDEATranslationsModule,
    DatetimeWithTimezoneStandaloneComponent
  ],
  declarations: [RegistrationFormPage]
})
export class RegistrationFormPageModule { }
