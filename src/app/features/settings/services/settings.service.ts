import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface QrPayload {
  qrImageSrc: string;
  source: 'base64' | 'url';
}

export interface LoggedSessionInfo {
  deviceId: string;
  qrDuration: number;
  isReady: boolean;
  state: string;
  jid: string;
}

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private readonly httpClient = inject(HttpClient);
  private readonly loginEndpoint = `${environment.apiCore}/device/login`;
  private readonly logoutEndpoint = `${environment.apiCore}/device/logout`;

  getLoginQr(): Observable<unknown> {
    return this.httpClient.post(this.loginEndpoint, {});
  }

  logoutWhatsappConnection(): Observable<unknown> {
    return this.httpClient.post(this.logoutEndpoint, {});
  }

  toLoggedSessionInfo(response: unknown): LoggedSessionInfo | null {
    const root = this.asRecord(response);
    if (!root) {
      return null;
    }

    const container = this.asRecord(root['results']);
    if (!container) {
      return null;
    }

    const isReady = this.firstBoolean(container, ['is_ready', 'isReady']) ?? false;
    if (!isReady) {
      return null;
    }

    const session = this.asRecord(container['session']);
    if (!session) {
      return null;
    }

    const state = this.firstString(session, ['state']);
    if (state !== 'logged_in') {
      return null;
    }

    const jid = this.firstString(session, ['jid']) || 'No disponible';

    const deviceId = this.firstString(container, ['device_id', 'deviceId']) || 'No disponible';
    const qrDuration = this.firstNumber(container, ['qr_duration', 'qrDuration']) ?? 0;

    return {
      deviceId,
      qrDuration,
      isReady,
      state,
      jid,
    };
  }

  toQrPayload(response: unknown): QrPayload | null {
    const root = this.asRecord(response);
    if (!root) {
      return null;
    }

    const container = this.asRecord(root['results']);
    if (!container) {
      return null;
    }

    const qrBase64 = this.firstString(container, ['qr_png_base64', 'qrPngBase64', 'qr_base64']);
    if (qrBase64) {
      return {
        qrImageSrc: this.asPngDataUrl(qrBase64),
        source: 'base64',
      };
    }

    const qrUrl = this.firstString(container, ['qr_link', 'qrLink']);
    if (qrUrl) {
      return {
        qrImageSrc: qrUrl,
        source: 'url',
      };
    }

    return null;
  }

  private asPngDataUrl(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith('data:image')) {
      return trimmed;
    }

    return `data:image/png;base64,${trimmed}`;
  }

  private firstString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    return null;
  }

  private firstNumber(source: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  private firstBoolean(source: Record<string, unknown>, keys: string[]): boolean | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'boolean') {
        return value;
      }
    }

    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
