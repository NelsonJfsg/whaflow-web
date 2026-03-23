import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { TokenService } from '../services/token.service';

@Injectable({ providedIn: 'root' })
export class NoAuthGuard implements CanActivate {
  private router = inject(Router);
  private tokenService = inject(TokenService);

  canActivate(): boolean {
    // Only allow access if NOT authenticated
    if (this.tokenService.isTokenValid()) {
      this.router.navigate(['/tasks']);
      return false;
    }
    return true;
  }
}