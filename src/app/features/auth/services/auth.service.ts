import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
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
  private readonly router = inject(Router);

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
   * Refresh the access token using the refresh token.
   * Updates the tokens in localStorage if successful.
   */
  refreshToken(): Observable<unknown> {
    const refreshToken = this.tokenService.getRefreshToken();
    if (!refreshToken) {
      this.logout();
      throw new Error('No refresh token available');
    }

    return this.httpClient
      .post(
        `${environment.authApiUrl}/refresh`,
        { refreshToken },
        {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
        }
      )
      .pipe(timeout(10000));
  }

  /**
   * Clears the user token from localStorage (call on logout).
   */
  logout(): void {
    this.tokenService.clearToken();
    this.router.navigate(['/login']);
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

  extractRefreshToken(response: unknown): string | null {
    const root = this.asRecord(response);
    if (!root) {
      return null;
    }

    const directRefreshToken = this.firstString(root, ['refreshToken', 'refresh_token']);
    if (directRefreshToken) {
      return directRefreshToken;
    }

    const nested = this.asRecord(root['results']) ?? this.asRecord(root['result']) ?? this.asRecord(root['data']);
    if (!nested) {
      return null;
    }

    return this.firstString(nested, ['refreshToken', 'refresh_token']);
  }

  extractUserName(response: unknown): string | null {
    const root = this.asRecord(response);
    if (!root) {
      return null;
    }

    const user = this.asRecord(root['user']);
    if (!user) {
      return null;
    }

    const userName = user['userName'];
    if (typeof userName === 'string' && userName.trim().length > 0) {
      return userName;
    }

    return null;
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
