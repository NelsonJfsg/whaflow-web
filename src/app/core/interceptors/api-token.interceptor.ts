import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { TokenService } from '../services/token.service';
import { AuthService } from '../../features/auth/services/auth.service';

/**
 * HTTP Interceptor that:
 * 1. Adds JWT access token to all API requests
 * 2. Handles 401 errors by attempting to refresh the token
 * 3. Retries the original request with the new token
 * 4. Logs out the user if refresh fails
 */
export const apiTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const authService = inject(AuthService);
  const token = tokenService.getToken();

  let clonedRequest = req;

  // Add Authorization header if token exists
  if (token) {
    clonedRequest = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(clonedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only handle 401 errors (Unauthorized)
      if (error.status === 401) {
        // Attempt to refresh the token
        return authService.refreshToken().pipe(
          switchMap((response: any) => {
            // Extract and store new tokens
            const newAccessToken = authService.extractToken(response) || 'session-active';
            const newRefreshToken = authService.extractRefreshToken(response);
            const userName = authService.extractUserName(response);

            tokenService.setToken(newAccessToken, newRefreshToken ?? undefined, userName ?? undefined);

            // Retry the original request with new token
            const retryRequest = clonedRequest.clone({
              setHeaders: {
                Authorization: `Bearer ${newAccessToken}`,
              },
            });

            return next(retryRequest);
          }),
          catchError(() => {
            // Refresh failed, logout the user
            authService.logout();
            return throwError(() => error);
          })
        );
      }

      return throwError(() => error);
    })
  );
};

