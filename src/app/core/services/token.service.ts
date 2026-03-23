import { Injectable } from '@angular/core';

const TOKEN_KEY = 'accessToken';

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
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * Store the access token in localStorage.
   */
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  /**
   * Remove the access token from localStorage (logout).
   */
  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
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

      const payload = parts[1];
      const decoded = JSON.parse(atob(payload));
      return decoded;
    } catch {
      return null;
    }
  }
}
