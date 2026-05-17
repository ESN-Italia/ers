import { Component } from '@angular/core';

import { AppService } from '@app/app.service';
import { addIcons } from 'ionicons';
import { balloon, calendar, chatbubbles, home, person, settings, ticket } from 'ionicons/icons';


@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.component.html',
  styleUrls: ['tabs.component.scss']
})
export class TabsComponent {
  constructor(public app: AppService) {
    addIcons({ balloon, calendar, chatbubbles, home, person, settings, ticket });}
}
