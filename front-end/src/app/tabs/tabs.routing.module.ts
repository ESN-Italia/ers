import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TabsComponent } from './tabs.component';

const routes: Routes = [
  {
    path: '',
    component: TabsComponent,
    children: [
      { path: '', redirectTo: 'ers-events', pathMatch: 'full' },
      {
        path: 'ers-events',
        loadChildren: (): Promise<any> =>
          import('./ers-events/ers-events.module').then(m => m.ERSEventsPageModule)
      },
      {
        path: 'profile',
        loadChildren: (): Promise<any> => import('./profile/profile.module').then(m => m.ProfileModule)
      },
      {
        path: 'configurations',
        loadChildren: (): Promise<any> =>
          import('./configurations/configurations.module').then(m => m.ConfigurationsModule)
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)]
})
export class TabsComponentRoutingModule { }
