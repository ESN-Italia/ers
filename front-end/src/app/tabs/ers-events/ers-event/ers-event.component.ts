import { Component, EventEmitter, Input, Output } from '@angular/core';

import { AppService } from '@app/app.service';
import { ERSEvent } from '@models/ersEvent.model';
import { addIcons } from 'ionicons';
import { listOutline } from 'ionicons/icons';


@Component({
  selector: 'app-ers-event',
  templateUrl: './ers-event.component.html',
  styleUrls: ['./ers-event.component.scss']
})
export class ERSEventComponent {
  @Input() event: ERSEvent | null;
  @Input() row = false;
  @Input() header = false;
  @Output() select = new EventEmitter<void>();
  @Output() viewRegs = new EventEmitter<Event>();
  now = new Date().toISOString();

  constructor(public app: AppService) {
    addIcons({ listOutline });
  }
}
