import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { RegistrationDetailPage } from './registration-detail.page';

const routes: Routes = [
  {
    path: '',
    component: RegistrationDetailPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RegistrationDetailPageRoutingModule { }
