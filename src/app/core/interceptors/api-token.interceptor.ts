import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { TokenService } from '../services/token.service';
import { AuthService } from '../../features/auth/services/auth.service';
import { environment } from '../../../environments/environment';

const REFRESH_ATTEMPTED = new HttpContextToken<boolean>(() => false);

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
  const isApiCoreRequest = req.url.startsWith(environment.apiCore);
  const isAuthRequest = req.url.startsWith(environment.authApiUrl);
  const shouldProtectRequest = isApiCoreRequest && !isAuthRequest;

  let clonedRequest = req;

  // Prevent protected API requests without an active session.
  if (shouldProtectRequest && !token) {
    authService.logout();
    return throwError(
      () => new HttpErrorResponse({ status: HttpStatusCode.Unauthorized, statusText: 'Unauthorized', url: req.url }),
    );
  }

  // Add Authorization header when a token exists.
  if (token && shouldProtectRequest) {
    clonedRequest = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(clonedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      // Refresh flow is only for protected API requests and only once per request.
      if (error.status === 401 && shouldProtectRequest && !req.context.get(REFRESH_ATTEMPTED)) {
        // Attempt to refresh the token
        return authService.refreshToken().pipe(
          switchMap((response: unknown) => {
            // Extract and store new tokens
            const newAccessToken = authService.extractToken(response);
            const newRefreshToken = authService.extractRefreshToken(response);
            const userName = authService.extractUserName(response);

            if (!newAccessToken) {
              authService.logout();
              return throwError(() => error);
            }

            tokenService.setToken(newAccessToken, newRefreshToken ?? undefined, userName ?? undefined);

            // Retry the original request with new token
            const retryRequest = clonedRequest.clone({
              context: req.context.set(REFRESH_ATTEMPTED, true),
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

