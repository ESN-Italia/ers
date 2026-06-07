import { Component, inject } from '@angular/core';
import { IDEATranslationsService, IDEATranslationsModule } from '@idea-ionic/common';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonButtons } from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-privacy-policy',
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['./privacy-policy.component.scss'],
  imports: [IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IDEATranslationsModule]
})
export class PrivacyPolicyComponent {
  t = inject(IDEATranslationsService);
  modalCtrl = inject(ModalController);

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
