import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { NavbarService } from '../../../../shared/ui/layout/services/navbar.service';
import { AuthService } from '../../services/auth.service';
import { TokenService } from '../../../../core/services/token.service';

@Component({
  selector: 'auth-login-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {

  private formBuilder = inject(FormBuilder);
  private router = inject(Router);
  private authService = inject(AuthService);
  private tokenService = inject(TokenService);
  public navbarService = inject(NavbarService);
  protected isSubmitting = signal(false);
  protected loginError = signal('');

  protected readonly loginForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  public login() : void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.loginError.set('Captura correo y contrasena validos.');
      return;
    }

    this.isSubmitting.set(true);
    this.loginError.set('');

    this.authService
      .login(this.loginForm.getRawValue())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (response: unknown) => {
          const accessToken = this.authService.extractToken(response);
          if (!accessToken) {
            this.loginError.set('La respuesta de autenticacion no incluyo access token.');
            return;
          }

          const refreshToken = this.authService.extractRefreshToken(response);
          const userName = this.authService.extractUserName(response);
          
          this.tokenService.setToken(accessToken, refreshToken ?? undefined, userName ?? undefined);
          this.router.navigate(['/dashboard']);
        },
        error: () => {
          this.loginError.set('No se pudo iniciar sesion. Verifica tus credenciales o el servicio de autenticacion.');
        },
      });
  }

  public onHandleTheme() {
    this.navbarService.setThemeToLocalStorage(() => {
      if (this.navbarService.getTheme) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }else{
        document.documentElement.setAttribute('data-theme', 'light');
      }
    });
  }

}
