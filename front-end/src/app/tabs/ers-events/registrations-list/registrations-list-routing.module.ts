import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { RegistrationsListPage } from './registrations-list.page';

const routes: Routes = [
  {
    path: '',
    component: RegistrationsListPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RegistrationsListPageRoutingModule { }
