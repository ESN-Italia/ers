import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular, IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { IonicStorageModule } from '@ionic/storage-angular';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app.routing.module';

import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
registerLocaleData(localeIt, 'it');

import { IDEAEnvironment, IDEATranslationsService } from '@idea-ionic/common';
import { environment } from 'src/environments/environment';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    IonicStorageModule.forRoot({ name: 'jupiter-app' }),
    IonApp,
    IonRouterOutlet
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: IDEAEnvironment, useValue: environment },
    { provide: IDEATranslationsService, useClass: IDEATranslationsService },
    provideIonicAngular({ mode: 'md' })
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }