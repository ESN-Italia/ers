import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ModalController } from '@ionic/angular';
import { IDEATranslationsModule, IDEATranslationsService } from '@idea-ionic/common';
import { addIcons } from 'ionicons';
import { checkmark, close, createOutline, trashOutline } from 'ionicons/icons';

import { HTMLEditorModule } from '@common/htmlEditor.module';
import { DatetimeWithTimezoneStandaloneComponent } from '@common/datetimeWithTimezone';

import { ERSEvent, EventInvoice, EventInvoiceProduct } from '@models/ersEvent.model';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    IDEATranslationsModule,
    HTMLEditorModule,
    DatetimeWithTimezoneStandaloneComponent
  ],
  selector: 'app-invoice-editor',
  templateUrl: './invoice-editor.component.html'
})
export class InvoiceEditorComponent implements OnInit {
  /**
   * The invoice to edit; if absent, a new one is created.
   */
  @Input() invoice?: EventInvoice;
  /**
   * The event the invoice belongs to (used for the timezone and to default the primary flag).
   */
  @Input() event: ERSEvent;

  localInvoice: EventInvoice;
  isEdit = false;

  constructor(
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private t: IDEATranslationsService
  ) {
    addIcons({ checkmark, close, createOutline, trashOutline });
  }

  ngOnInit(): void {
    if (this.invoice) {
      this.isEdit = true;
      this.localInvoice = new EventInvoice(JSON.parse(JSON.stringify(this.invoice)));
    } else {
      this.localInvoice = new EventInvoice({
        id: Date.now().toString(),
        name: '',
        description: '',
        paymentInfo: '',
        isPrimary: !this.event?.invoices?.length,
        products: []
      });
    }
    if (!this.localInvoice.products) this.localInvoice.products = [];
  }

  isValid(): boolean {
    return !!this.localInvoice.name?.trim() && !!this.localInvoice.paymentInfo?.trim();
  }

  async addProduct(): Promise<void> {
    const doAdd = ({ name, price }): void => {
      if (!name || price === undefined || price === '') return;
      this.localInvoice.products.push(
        new EventInvoiceProduct({ id: Date.now().toString(), name, price: Number(price) })
      );
    };
    const alert = await this.alertCtrl.create({
      header: this.t._('ERS_EVENTS.ADD_PRODUCT'),
      inputs: [
        { name: 'name', type: 'text', placeholder: this.t._('ERS_EVENTS.PRODUCT_NAME') },
        { name: 'price', type: 'number', placeholder: this.t._('ERS_EVENTS.PRICE') }
      ],
      buttons: [
        { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
        { text: this.t._('COMMON.ADD'), handler: doAdd }
      ]
    });
    await alert.present();
  }

  async editProduct(product: EventInvoiceProduct): Promise<void> {
    const doEdit = ({ name, price }): void => {
      if (!name || price === undefined || price === '') return;
      product.name = name;
      product.price = Number(price);
    };
    const alert = await this.alertCtrl.create({
      header: this.t._('ERS_EVENTS.EDIT_PRODUCT'),
      inputs: [
        { name: 'name', type: 'text', value: product.name, placeholder: this.t._('ERS_EVENTS.PRODUCT_NAME') },
        { name: 'price', type: 'number', value: product.price, placeholder: this.t._('ERS_EVENTS.PRICE') }
      ],
      buttons: [
        { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
        { text: this.t._('COMMON.SAVE'), handler: doEdit }
      ]
    });
    await alert.present();
  }

  removeProduct(index: number): void {
    this.localInvoice.products.splice(index, 1);
  }

  save(): void {
    if (this.isValid()) this.modalCtrl.dismiss(this.localInvoice);
  }

  close(): void {
    this.modalCtrl.dismiss();
  }
}
