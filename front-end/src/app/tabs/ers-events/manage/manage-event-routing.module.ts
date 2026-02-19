import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ManageEventPage } from './manage-event.page';

const routes: Routes = [
  {
    path: '',
    component: ManageEventPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ManageEventPageRoutingModule { }
