import { Component, Input } from '@angular/core';
import { IonRefresher } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { VotingService } from './voting.service';

import { Voter, VotingSession, VotingSessionTypes } from '@models/votingSession.model';
import { addIcons } from 'ionicons';
import { arrowBack, build, download, golfOutline, playOutline, stopOutline, ticketOutline } from 'ionicons/icons';


@Component({
  selector: 'voting-session',
  templateUrl: 'votingSession.page.html',
  styleUrls: ['votingSession.page.scss']
})
export class VotingSessionPage {
  @Input() sessionId: string;
  votingSession: VotingSession;

  absentVoters: Voter[];

  VotingSessionTypes = VotingSessionTypes;

  constructor(
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private _voting: VotingService,
    private t: IDEATranslationsService,
    public app: AppService
  ) {
    addIcons({ arrowBack, build, download, golfOutline, playOutline, stopOutline, ticketOutline });}
  async ionViewWillEnter(): Promise<void> {
    try {
      await this.loading.show();
      await this.loadResources();
    } catch (error) {
      this.message.error('COMMON.NOT_FOUND');
    } finally {
      this.loading.hide();
    }
  }
  private async loadResources(): Promise<void> {
    this.votingSession = await this._voting.getById(this.sessionId);
    if (this.votingSession.resultsPublished) this.absentVoters = this.votingSession.getAbsentVoters();
    else {
      delete this.votingSession.results;
      delete this.votingSession.participantVoters;
    }
  }
  async handleRefresh(refresh: IonRefresher): Promise<void> {
    await this.loadResources();
    refresh.complete();
  }

  manageSession(): void {
    this.app.goToInTabs(['voting', this.votingSession.sessionId, 'manage']);
  }

  wasVoterAbsent(voter: Voter): boolean {
    return this.absentVoters.some(x => x.id === voter.id);
  }

  downloadResults(): void {
    if (!this.votingSession.results) return;

    const sessionName = this.votingSession.name.replace(/[^\w\s]/g, '');
    const filename = `${sessionName} - ${this.t._('VOTING.RESULTS')}.xlsx`;
    this._voting.downloadResultsSpreadsheet(filename, this.votingSession, this.votingSession.results);
  }

  getColorByType(): string {
    if (this.votingSession.type === VotingSessionTypes.FORM_SECRET) return 'ESNpink';
    if (this.votingSession.type === VotingSessionTypes.IMMEDIATE) return 'ESNcyan';
    if (this.votingSession.type === VotingSessionTypes.ROLL_CALL) return 'secondary';
    return 'ESNdarkBlue';
  }
}
