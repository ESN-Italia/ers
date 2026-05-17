import { Component } from '@angular/core';
import { addIcons } from 'ionicons';
import * as allIcons from 'ionicons/icons';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss']
})
export class AppComponent {
  constructor() {
    // TODO import icons inside each component

    // 1. Create a cleanly formatted dictionary for the icon engine
    const formattedIcons: { [key: string]: string } = {};

    // 2. Loop through all icons and convert their keys to match HTML string names
    Object.keys(allIcons).forEach((key) => {
      // Convert CamelCase (checkmarkDoneOutline) to kebab-case (checkmark-done-outline)
      const kebabKey = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

      // Map both forms so both name="checkmarkDoneOutline" AND name="checkmark-done-outline" work
      formattedIcons[kebabKey] = (allIcons as any)[key];
      // formattedIcons[key] = (allIcons as any)[key];
    });

    // 3. Register the perfectly formatted map globally
    addIcons(formattedIcons);
  }
}
