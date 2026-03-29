import { Injectable } from '@angular/core';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_NAME_KEY = 'userName';

/**
 * Service to manage JWT token operations.
 * Handles token storage, validation, and expiration checking.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  /**
   * Get the stored access token from localStorage.
   */
  getToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  /**
   * Store the access token, refresh token, and user name in localStorage.
   */
  setToken(accessToken: string, refreshToken?: string, userName?: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
    if (userName) {
      localStorage.setItem(USER_NAME_KEY, userName);
    }
  }

  /**
   * Get the stored refresh token from localStorage.
   */
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /**
   * Get the stored user name from localStorage.
   */
  getUserName(): string | null {
    return localStorage.getItem(USER_NAME_KEY);
  }

  getUserId(): string | null {
    const token = this.getToken();
    if (!token) {
      return null;
    }

    const payload = this.decodeToken(token);
    if (!payload) {
      return null;
    }

    const candidateKeys = ['userId', 'user_id', 'sub', 'uid', 'id', 'email'];
    for (const key of candidateKeys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `${Math.trunc(value)}`;
      }
    }

    return null;
  }

  getUserScopeKey(): string {
    const userId = this.getUserId();
    if (userId) {
      return `u:${userId}`;
    }

    const userName = this.getUserName();
    if (userName && userName.trim().length > 0) {
      return `n:${userName.trim().toLocaleLowerCase()}`;
    }

    return 'anonymous';
  }

  /**
   * Remove all authentication data from localStorage (logout).
   */
  clearToken(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_NAME_KEY);
  }

  /**
   * Check if token exists and is not expired.
   * Decodes JWT payload to check exp field.
   */
  isTokenValid(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    try {
      const payload = this.decodeToken(token);
      if (!payload) {
        return false;
      }

      const exp = payload['exp'];
      if (typeof exp !== 'number') {
        return false;
      }

      // Compare current time (in seconds) with token expiration
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      return currentTimeInSeconds < exp;
    } catch {
      return false;
    }
  }

  /**
   * Decode JWT payload (does NOT verify signature on frontend).
   * The backend validates the signature when processing requests.
   */
  private decodeToken(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = this.base64UrlToBase64(parts[1]);
      const decoded = JSON.parse(atob(payload));
      return decoded;
    } catch {
      return null;
    }
  }

  private base64UrlToBase64(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;

    if (padding === 0) {
      return normalized;
    }

    return `${normalized}${'='.repeat(4 - padding)}`;
  }
}
