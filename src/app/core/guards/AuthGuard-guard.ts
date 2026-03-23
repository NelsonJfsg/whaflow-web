import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { TokenService } from '../services/token.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private router = inject(Router);
  private tokenService = inject(TokenService);

  canActivate(): boolean {
    // Check if token exists and is not expired
    if (!this.tokenService.isTokenValid()) {
      // Clear expired token
      this.tokenService.clearToken();
      this.router.navigate(['/auth']);
      return false;
    }
    return true;
  }
}