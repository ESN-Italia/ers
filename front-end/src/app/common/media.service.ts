import { Injectable } from '@angular/core';
import { IDEAApiService } from '@idea-ionic/common';
import { environment as env } from '@env';

@Injectable({ providedIn: 'root' })
export class MediaService {
  constructor(private api: IDEAApiService) {}

  /**
   * Upload a new image and get its URI.
   */
  async uploadImage(file: File): Promise<string> {
    const { url, id } = await this.api.postResource('media');
    await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    await sleepForNumSeconds(5);
    return id;
  }

  /**
   * Upload a file and get its details (id, name, and S3 url).
   */
  async uploadFile(file: File): Promise<{ id: string; name: string; url: string }> {
    const extension = file.name.split('.').pop() || 'bin';
    const { url, id } = await this.api.postResource('media', { body: { extension } });
    await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
    await sleepForNumSeconds(2);
    const mediaUrl = `${env.idea.app.mediaUrl}/images/${env.idea.api.stage}/${id}`;
    return { id, name: file.name, url: mediaUrl };
  }
}

const sleepForNumSeconds = (numSeconds = 1): Promise<void> =>
  new Promise(resolve => setTimeout((): void => resolve(null), 1000 * numSeconds));
