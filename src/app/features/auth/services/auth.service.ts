import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TokenService } from '../../../core/services/token.service';

export interface AuthLoginPayload {
  email: string;
  password: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly httpClient = inject(HttpClient);
  private readonly tokenService = inject(TokenService);

  login(payload: AuthLoginPayload): Observable<unknown> {
    return this.httpClient
      .post(environment.authApiUrl, payload, {
        headers: new HttpHeaders({
          'Content-Type': 'application/json',
        }),
      })
      .pipe(timeout(10000));
  }

  /**
   * Clears the user token from localStorage (call on logout).
   */
  logout(): void {
    this.tokenService.clearToken();
  }

  extractToken(response: unknown): string | null {
    const root = this.asRecord(response);
    if (!root) {
      return null;
    }

    const directToken = this.firstString(root, ['token', 'accessToken', 'access_token', 'jwt']);
    if (directToken) {
      return directToken;
    }

    const nested = this.asRecord(root['results']) ?? this.asRecord(root['result']) ?? this.asRecord(root['data']);
    if (!nested) {
      return null;
    }

    return this.firstString(nested, ['token', 'accessToken', 'access_token', 'jwt']);
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

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
