import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { IDEATranslationsModule, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';


@Component({
  standalone: true,
  imports: [CommonModule, IonicModule, IDEATranslationsModule],
  selector: 'app-privacy-policy',
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['./privacy-policy.component.scss']
})
export class PrivacyPolicyComponent implements OnInit {
  section: any;

  constructor(
    private modalCtrl: ModalController,
    public app: AppService,
    public t: IDEATranslationsService
  ) {
    addIcons({ close }); }

  ngOnInit(): void {
    this.section = {
      legalInfo: {
        fullName: this.app.configurations?.appTitle || 'Erasmus Student Network',
        shortName: this.app.configurations?.appTitle || 'ESN',
        city: 'N/A',
        legalPlaceAddress: 'N/A',
        email: this.app.configurations?.supportEmail || 'N/A',
        president: 'the Legal Representative'
      }
    };
  }

  close(): void {
    this.modalCtrl.dismiss();
  }
}
