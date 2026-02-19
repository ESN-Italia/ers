import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ERSEventsPage } from './ers-events.page';

const routes: Routes = [
  {
    path: '',
    component: ERSEventsPage
  },
  {
    path: 'new/manage',
    loadChildren: () => import('./manage/manage-event.module').then(m => m.ManageEventPageModule)
  },
  {
    path: ':eventId',
    loadChildren: () => import('./detail/event-detail.module').then(m => m.EventDetailPageModule)
  },
  {
    path: ':eventId/manage',
    loadChildren: () => import('./manage/manage-event.module').then(m => m.ManageEventPageModule)
  },
  {
    path: ':eventId/register',
    loadChildren: () => import('./register/registration-form.module').then(m => m.RegistrationFormPageModule)
  },
  {
    path: ':eventId/registration',
    loadChildren: () => import('./registration/registration-detail.module').then(m => m.RegistrationDetailPageModule)
  },
  {
    path: ':eventId/registrations',
    loadChildren: () => import('./registrations-list/registrations-list.module').then(m => m.RegistrationsListPageModule)
  },
  {
    path: ':eventId/registrations/:registrationId',
    loadChildren: () => import('./registration/registration-detail.module').then(m => m.RegistrationDetailPageModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ERSEventsPageRoutingModule { }
