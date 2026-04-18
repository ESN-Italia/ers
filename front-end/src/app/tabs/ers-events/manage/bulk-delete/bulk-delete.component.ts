import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { IDEATranslationsModule } from '@idea-ionic/common';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, IDEATranslationsModule],
  selector: 'app-bulk-delete',
  templateUrl: './bulk-delete.component.html',
  styleUrls: ['./bulk-delete.component.scss']
})
export class BulkDeleteComponent {
  @Input() items: { id: string, label: string, selected?: boolean }[] = [];

  constructor(private modalCtrl: ModalController) {}

  hasSelected(): boolean {
    return this.items.some(i => i.selected);
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  confirm(): void {
    const selectedIds = this.items.filter(i => i.selected).map(i => i.id);
    this.modalCtrl.dismiss(selectedIds);
  }
}
