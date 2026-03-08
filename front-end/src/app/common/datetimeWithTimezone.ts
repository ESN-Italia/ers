import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { formatInTimeZone, zonedTimeToUtc } from 'date-fns-tz';
import { epochISOString } from 'idea-toolbox';

import { AppService } from '@app/app.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  selector: 'app-datetime-timezone',
  template: `
    <ion-item [lines]="lines" [color]="color">
      <ion-label position="stacked">{{ label }} <ion-text class="obligatoryDot" *ngIf="obligatory" /></ion-label>
      <input
        #dateTime
        [type]="presentation"
        [disabled]="disabled"
        [value]="initialValue"
        [min]="minLocalValue"
        [max]="maxLocalValue"
        (change)="dateChange.emit(zonedTimeStringToUTC($event.target.value))"
      />
    </ion-item>
  `
})
export class DatetimeWithTimezoneStandaloneComponent implements OnInit, OnChanges {
  /**
   * The date to manage.
   */
  @Input() date: epochISOString;
  @Output() dateChange = new EventEmitter<epochISOString>();
  /**
   * The minimum selectable date limit.
   */
  @Input() min: epochISOString;
  /**
   * The maximum selectable date limit.
   */
  @Input() max: epochISOString;
  /**
   * The timezone to consider.
   * Fallback to the default value set in the configurations.
   */
  @Input() timezone: string;
  /**
   * A label for the item.
   */
  @Input() label: string;
  /**
   * The color of the item.
   */
  @Input() color: string;
  /**
   * The lines attribute of the item.
   */
  @Input() lines: string;
  /**
   * Whether the component is disabled or editable.
   */
  @Input() disabled = false;
  /**
   * Whether the date is obligatory.
   */
  @Input() obligatory = false;
  /**
   * The presentation of the field.
   */
  @Input() presentation: 'date' | 'datetime-local' = 'datetime-local';

  initialValue: epochISOString;
  minLocalValue: string;
  maxLocalValue: string;

  @ViewChild('dateTime') dateTime: ElementRef;

  constructor(public app: AppService) { }
  async ngOnInit(): Promise<void> {
    this.timezone = this.timezone ?? this.app.configurations.timezone;
    this.initialValue = this.utcToZonedTimeString(this.date);
    this.minLocalValue = this.utcToZonedTimeString(this.min);
    this.maxLocalValue = this.utcToZonedTimeString(this.max);
  }
  ngOnChanges(changes: SimpleChanges): void {
    // fix the date if the linked timezone changes
    if ((changes.timezone?.currentValue || changes.date?.currentValue) && this.dateTime) {
      this.initialValue = this.utcToZonedTimeString(this.date);
    }
    if ((changes.timezone?.currentValue || changes.min?.currentValue) && this.dateTime) {
      this.minLocalValue = this.utcToZonedTimeString(this.min);
    }
    if ((changes.timezone?.currentValue || changes.max?.currentValue) && this.dateTime) {
      this.maxLocalValue = this.utcToZonedTimeString(this.max);
    }
  }

  utcToZonedTimeString(isoString: epochISOString): string {
    if (!isoString) return '';
    const format = this.presentation === 'date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm";
    return formatInTimeZone(isoString, this.timezone, format);
  }
  zonedTimeStringToUTC(dateLocale: string): epochISOString {
    return zonedTimeToUtc(new Date(dateLocale), this.timezone).toISOString();
  }
}
