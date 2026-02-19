import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { ERSEventsService } from '../ers-events.service';
import { ERSEvent } from '@models/ersEvent.model';
import { ERSRegistration, RegistrationStatus } from '@models/ersRegistration.model';

@Component({
  selector: 'app-registrations-list',
  templateUrl: './registrations-list.page.html',
  styleUrls: ['./registrations-list.page.scss']
})
export class RegistrationsListPage implements OnInit {
  eventId: string;
  event: ERSEvent;
  registrations: ERSRegistration[];
  filteredRegistrations: ERSRegistration[];
  RegistrationStatus = RegistrationStatus;

  filterStatus: RegistrationStatus | 'ALL' = 'ALL';
  filterBySpotId: string = null;
  searchTerm = '';
  selectedIds = new Set<string>();

  constructor(
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private t: IDEATranslationsService,
    private service: ERSEventsService,
    public app: AppService
  ) { }

  async ngOnInit(): Promise<void> {
    this.eventId = this.route.snapshot.paramMap.get('eventId');
  }

  async ionViewWillEnter(): Promise<void> {
    await this.loadData();
  }

  async loadData(showLoading = true): Promise<void> {
    try {
      if (showLoading) await this.loading.show();
      this.event = await this.service.getById(this.eventId);
      if (!this.event.canUserManage(this.app.user)) return this.app.closePage('COMMON.UNAUTHORIZED');

      this.registrations = await this.service.getRegistrations(this.eventId);
      this.filter();
      this.selectedIds.clear();
    } catch (err) {
      this.message.error('COMMON.NOT_FOUND');
    } finally {
      if (showLoading) this.loading.hide();
    }
  }

  filter(): void {
    if (!this.registrations) return;

    this.filteredRegistrations = this.registrations.filter(r => {
      const matchesStatus = this.filterStatus === 'ALL' || r.status === this.filterStatus;
      const matchesSpot = !this.filterBySpotId || r.spotId === this.filterBySpotId;

      const search = (this.searchTerm || '').toLowerCase();
      const matchesSearch = !search ||
        (r.firstName || '').toLowerCase().includes(search) ||
        (r.lastName || '').toLowerCase().includes(search) ||
        (r.email || '').toLowerCase().includes(search);

      return matchesStatus && matchesSpot && matchesSearch;
    });

    this.filteredRegistrations.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  getSpotName(spotId: string): string {
    return this.event?.spots?.find(s => s.id === spotId)?.name || 'Unknown';
  }

  getUserName(reg: ERSRegistration): string {
    return reg.firstName ? `${reg.firstName} ${reg.lastName}` : reg.userId;
  }

  viewDetail(reg: ERSRegistration): void {
    this.app.goToInTabs(['ers-events', this.eventId, 'registrations', reg.registrationId]);
  }

  isSelected(reg: ERSRegistration): boolean {
    return this.selectedIds.has(reg.registrationId);
  }

  toggleSelection(reg: ERSRegistration, event: any): void {
    event.stopPropagation();
    if (this.isSelected(reg)) {
      this.selectedIds.delete(reg.registrationId);
    } else {
      this.selectedIds.add(reg.registrationId);
    }
    // Re-assign to trigger change detection
    this.selectedIds = new Set(this.selectedIds);
  }

  toggleAll(): void {
    if (this.selectedIds.size === this.filteredRegistrations.length) {
      this.selectedIds.clear();
    } else {
      this.filteredRegistrations.forEach(r => this.selectedIds.add(r.registrationId));
    }
    // Re-assign to trigger change detection
    this.selectedIds = new Set(this.selectedIds);
  }

  async approveSelected(): Promise<void> {
    if (!this.selectedIds.size) return;

    try {
      await this.loading.show();
      for (const id of Array.from(this.selectedIds)) {
        await this.service.approveSpot(this.eventId, id);
      }
      await this.loadData(false);
      this.message.success('COMMON.OPERATION_COMPLETED');
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  async rejectSelected(): Promise<void> {
    if (!this.selectedIds.size) return;

    const alert = await this.alertCtrl.create({
      header: 'COMMON.ARE_YOU_SURE',
      buttons: [
        { text: 'COMMON.CANCEL', role: 'cancel' },
        {
          text: 'COMMON.CONFIRM',
          handler: async () => {
            try {
              await this.loading.show();
              for (const id of Array.from(this.selectedIds)) {
                await this.service.rejectSpot(this.eventId, id);
              }
              await this.loadData(false);
              this.message.success('COMMON.OPERATION_COMPLETED');
            } catch (err) {
              this.message.error('COMMON.OPERATION_FAILED');
            } finally {
              this.loading.hide();
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async approve(reg: ERSRegistration): Promise<void> {
    try {
      await this.loading.show();
      await this.service.approveSpot(this.eventId, reg.registrationId);
      await this.loadData(false);
      this.message.success('COMMON.OPERATION_COMPLETED');
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  async reject(reg: ERSRegistration): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'COMMON.ARE_YOU_SURE',
      buttons: [
        { text: 'COMMON.CANCEL', role: 'cancel' },
        {
          text: 'COMMON.CONFIRM',
          handler: async () => {
            try {
              await this.loading.show();
              await this.service.rejectSpot(this.eventId, reg.registrationId);
              await this.loadData(false);
              this.message.success('COMMON.OPERATION_COMPLETED');
            } catch (err) {
              this.message.error('COMMON.OPERATION_FAILED');
            } finally {
              this.loading.hide();
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async confirmPayment(reg: ERSRegistration): Promise<void> {
    try {
      await this.loading.show();
      await this.service.confirmPayment(this.eventId, reg.registrationId);
      await this.loadData(false);
      this.message.success('COMMON.OPERATION_COMPLETED');
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }
}
