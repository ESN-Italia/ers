import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { AngularEditorModule } from '@kolkov/angular-editor';
import { IDEATranslationsModule } from '@idea-ionic/common';

import { HTMLEditorComponent } from './htmlEditor.component';

@NgModule({ declarations: [HTMLEditorComponent],
    exports: [HTMLEditorComponent], imports: [CommonModule, FormsModule, IonicModule, AngularEditorModule, IDEATranslationsModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class HTMLEditorModule {}
