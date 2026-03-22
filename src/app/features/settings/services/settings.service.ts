import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

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
  private readonly loginEndpoint = 'http://localhost:3001/device/login';
  private readonly logoutEndpoint = 'http://localhost:3001/device/logut';

  getLoginQr(): Observable<unknown> {
    return this.httpClient.get(this.loginEndpoint, {});
  }

  logoutWhatsappConnection(): Observable<unknown> {
    return this.httpClient.post(this.logoutEndpoint, {});
  }

  toLoggedSessionInfo(response: unknown): LoggedSessionInfo | null {
    const root = this.asRecord(response);
    if (!root) {
      return null;
    }

    const container = this.asRecord(root['results']) ?? root;
    const session = this.asRecord(container['session']);
    if (!session) {
      return null;
    }

    const state = this.firstString(session, ['state']);
    const jid = this.firstString(session, ['jid']);
    if (state !== 'logged_in' || !jid) {
      return null;
    }

    const deviceId = this.firstString(container, ['device_id', 'deviceId']) || 'No disponible';
    const qrDuration = this.firstNumber(container, ['qr_duration', 'qrDuration']) ?? 0;
    const isReady = this.firstBoolean(container, ['is_ready', 'isReady']) ?? false;

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

    const directBase64 = this.firstString(root, ['qr_png_base64', 'qrPngBase64', 'qr_base64']);
    if (directBase64) {
      return {
        qrImageSrc: this.asPngDataUrl(directBase64),
        source: 'base64',
      };
    }

    const nested = this.asRecord(root['results']) ?? this.asRecord(root['result']) ?? this.asRecord(root['data']);
    if (nested) {
      const nestedBase64 = this.firstString(nested, ['qr_png_base64', 'qrPngBase64', 'qr_base64']);
      if (nestedBase64) {
        return {
          qrImageSrc: this.asPngDataUrl(nestedBase64),
          source: 'base64',
        };
      }
    }

    const directUrl = this.firstString(root, ['qr_link', 'qrLink']);
    if (directUrl) {
      return {
        qrImageSrc: directUrl,
        source: 'url',
      };
    }

    if (nested) {
      const nestedUrl = this.firstString(nested, ['qr_link', 'qrLink']);
      if (nestedUrl) {
        return {
          qrImageSrc: nestedUrl,
          source: 'url',
        };
      }
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
