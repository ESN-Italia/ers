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
  filterBySectionCode: string = null;
  searchTerm = '';
  selectedIds = new Set<string>();

  availableSections: { code: string, name: string }[] = [];

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

  async loadData(ev?: any, showLoading = true): Promise<void> {
    const isRefresher = ev && ev.target && ev.target.complete;
    try {
      if (!isRefresher && showLoading) await this.loading.show();
      this.event = await this.service.getById(this.eventId);
      if (!this.event.canUserManage(this.app.user)) return this.app.closePage('COMMON.UNAUTHORIZED');

      this.registrations = await this.service.getRegistrations(this.eventId);

      // Extract available sections
      const sectionsMap = new Map<string, string>();
      this.registrations.forEach(r => {
        if (r.sectionCode) sectionsMap.set(r.sectionCode, r.section);
      });
      this.availableSections = Array.from(sectionsMap.entries())
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      this.filter();
      this.selectedIds.clear();
    } catch (err) {
      this.message.error('COMMON.NOT_FOUND');
    } finally {
      if (isRefresher) ev.target.complete();
      else if (showLoading) this.loading.hide();
    }
  }

  filter(): void {
    if (!this.registrations) return;

    this.filteredRegistrations = this.registrations.filter(r => {
      const matchesStatus = this.filterStatus === 'ALL' || r.status === this.filterStatus;
      const matchesSpot = !this.filterBySpotId || r.spotId === this.filterBySpotId;
      const matchesSection = !this.filterBySectionCode || r.sectionCode === this.filterBySectionCode;

      const search = (this.searchTerm || '').toLowerCase();
      const matchesSearch = !search ||
        (r.firstName || '').toLowerCase().includes(search) ||
        (r.lastName || '').toLowerCase().includes(search) ||
        (r.email || '').toLowerCase().includes(search) ||
        (r.phone || '').toLowerCase().includes(search);

      return matchesStatus && matchesSpot && matchesSection && matchesSearch;
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

  downloadCSV(): void {
    if (!this.registrations?.length) return;

    const headers = [
      'Registration Date',
      'First Name',
      'Last Name',
      'Email',
      'Phone',
      'ESN Country',
      'ESN Section',
      'Section Code',
      'Spot',
      'Status',
      'ESNcard number',
      'ID Number',
      'ID Issued By',
      'ID Issued Date',
      'ID Valid Until',
      'Home address',
      'Food allergies',
      'Emergency Name',
      'Emergency Phone',
      'Emergency Languages'
    ];

    // Add dynamic questions to headers
    const dynamicQuestions = this.event?.questions || [];
    dynamicQuestions.forEach(q => headers.push(q.text));

    const csvRows = [];
    csvRows.push(headers.join(','));

    for (const reg of this.registrations) {
      const row = [
        reg.createdAt,
        this.escapeCSV(reg.firstName),
        this.escapeCSV(reg.lastName),
        this.escapeCSV(reg.email),
        this.escapeCSV(reg.phone),
        this.escapeCSV(reg.country),
        this.escapeCSV(reg.section),
        this.escapeCSV(reg.sectionCode),
        this.escapeCSV(this.getSpotName(reg.spotId)),
        reg.status,
        this.escapeCSV(reg.esnCardNumber),
        this.escapeCSV(reg.identityCard?.number),
        this.escapeCSV(reg.identityCard?.issuedBy),
        reg.identityCard?.issuedDate,
        reg.identityCard?.validUntil,
        this.escapeCSV(reg.homeAddress),
        this.escapeCSV(reg.foodAllergies),
        this.escapeCSV(reg.emergencyContact?.name),
        this.escapeCSV(reg.emergencyContact?.phone),
        this.escapeCSV(reg.emergencyContact?.spokenLanguages)
      ];

      // Add dynamic answers
      dynamicQuestions.forEach(q => {
        row.push(this.escapeCSV(this.formatAnswer(reg, q.id)));
      });

      csvRows.push(row.join(','));
    }

    const csvData = csvRows.join('\n');
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `${this.event.name}_registrations.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  private escapeCSV(val: any): string {
    if (val === undefined || val === null) return '';
    let str = String(val);
    str = str.replace(/"/g, '""');
    if (str.search(/("|,|\n)/g) >= 0) {
      str = `"${str}"`;
    }
    return str;
  }

  private formatAnswer(reg: ERSRegistration, questionId: string): string {
    const answer = reg.answers?.[questionId];
    if (Array.isArray(answer)) return answer.join('; ');
    return String(answer || '');
  }
}
