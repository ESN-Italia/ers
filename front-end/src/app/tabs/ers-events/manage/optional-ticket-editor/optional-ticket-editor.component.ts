import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { IDEATranslationsModule } from '@idea-ionic/common';
import { addIcons } from 'ionicons';
import { checkmark, close } from 'ionicons/icons';

import { ERSEvent, EventOptionalTicket } from '@models/ersEvent.model';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, IDEATranslationsModule],
  selector: 'app-optional-ticket-editor',
  templateUrl: './optional-ticket-editor.component.html'
})
export class OptionalTicketEditorComponent implements OnInit {
  /**
   * The optional ticket to edit; if absent, a new one is created.
   */
  @Input() ticket?: EventOptionalTicket;
  /**
   * The event, used to offer the list of invoices this ticket can be billed to.
   */
  @Input() event: ERSEvent;

  localTicket: EventOptionalTicket;
  isEdit = false;

  constructor(private modalCtrl: ModalController) {
    addIcons({ checkmark, close });
  }

  ngOnInit(): void {
    if (this.ticket) {
      this.isEdit = true;
      this.localTicket = new EventOptionalTicket(JSON.parse(JSON.stringify(this.ticket)));
    } else {
      this.localTicket = new EventOptionalTicket({ id: Date.now().toString(), name: '', description: '', price: 0 });
    }
    // Default the invoice to the primary one when unset, so the ticket is always billed somewhere explicit.
    if (!this.localTicket.invoiceId) this.localTicket.invoiceId = this.event?.getPrimaryInvoice()?.id;
  }

  isValid(): boolean {
    return !!this.localTicket.name?.trim() && this.localTicket.price !== undefined && this.localTicket.price >= 0;
  }

  save(): void {
    if (this.isValid()) this.modalCtrl.dismiss(this.localTicket);
  }

  close(): void {
    this.modalCtrl.dismiss();
  }
}
