import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { LoggedSessionInfo, SettingsService } from '../../services/settings.service';
import { TokenService } from '../../../../core/services/token.service';

@Component({
  selector: 'settings-page',
  imports: [],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly tokenService = inject(TokenService);
  private readonly refreshIntervalMs = 10000;
  private qrRefreshTimerId: ReturnType<typeof setInterval> | null = null;
  private activeUserScope = 'anonymous';

  protected readonly qrImageSrc = signal<string>('');
  protected readonly qrStatusText = signal<string>('Aun no hay QR cargado.');
  protected readonly qrError = signal<string>('');
  protected readonly logoutFeedback = signal<string>('');
  protected readonly isLoadingQr = signal<boolean>(false);
  protected readonly isLoggingOut = signal<boolean>(false);
  protected readonly loggedSession = signal<LoggedSessionInfo | null>(null);

  ngOnInit(): void {
    this.syncUserScope(true);
    this.loadQr();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  protected loadQr(): void {
    this.syncUserScope();

    if (this.isLoadingQr()) {
      return;
    }

    this.isLoadingQr.set(true);
    this.qrError.set('');
    this.logoutFeedback.set('');
    this.qrStatusText.set('Generando QR de conexion...');

    this.settingsService
      .getLoginQr()
      .pipe(finalize(() => this.isLoadingQr.set(false)))
      .subscribe({
        next: (response) => {
          const sessionInfo = this.settingsService.toLoggedSessionInfo(response);
          if (sessionInfo) {
            this.loggedSession.set(sessionInfo);
            this.qrImageSrc.set('');
            this.qrStatusText.set('Tu sesion de WhatsApp ya esta conectada.');
            this.stopAutoRefresh();
            return;
          }

          this.loggedSession.set(null);
          this.startAutoRefresh();
          const payload = this.settingsService.toQrPayload(response);
          this.qrImageSrc.set(payload?.qrImageSrc ?? '');
          this.qrStatusText.set(
            payload?.qrImageSrc
              ? 'Escanea este codigo QR desde WhatsApp para vincular tu sesion.'
              : 'No hay QR disponible en este momento.',
          );
        },
        error: () => {
          this.loggedSession.set(null);
          this.startAutoRefresh();
          this.qrImageSrc.set('');
          this.qrError.set(`No fue posible conectar con ${environment.apiCore}/device/login.`);
          this.qrStatusText.set('Error al generar QR.');
        },
      });
  }

  protected logoutConnection(): void {
    if (this.isLoggingOut()) {
      return;
    }

    this.isLoggingOut.set(true);
    this.qrError.set('');
    this.logoutFeedback.set('Cerrando sesion de WhatsApp...');

    this.settingsService
      .logoutWhatsappConnection()
      .pipe(finalize(() => this.isLoggingOut.set(false)))
      .subscribe({
        next: () => {
          this.loggedSession.set(null);
          this.qrImageSrc.set('');
          this.logoutFeedback.set('Sesion cerrada. Solicitando un nuevo QR...');
          this.startAutoRefresh();
          this.loadQr();
        },
        error: () => {
          this.logoutFeedback.set('No fue posible cerrar sesion en /device/logout.');
        },
      });
  }

  private startAutoRefresh(): void {
    if (this.loggedSession()) {
      return;
    }

    if (this.qrRefreshTimerId !== null) {
      return;
    }

    this.stopAutoRefresh();
    this.qrRefreshTimerId = setInterval(() => {
      if (this.isLoggingOut() || this.loggedSession()) {
        return;
      }

      this.loadQr();
    }, this.refreshIntervalMs);
  }

  private stopAutoRefresh(): void {
    if (this.qrRefreshTimerId === null) {
      return;
    }

    clearInterval(this.qrRefreshTimerId);
    this.qrRefreshTimerId = null;
  }

  private syncUserScope(forceReset = false): void {
    const nextScope = this.tokenService.getUserScopeKey();
    if (!forceReset && nextScope === this.activeUserScope) {
      return;
    }

    this.activeUserScope = nextScope;
    this.stopAutoRefresh();
    this.qrImageSrc.set('');
    this.qrError.set('');
    this.logoutFeedback.set('');
    this.loggedSession.set(null);
    this.qrStatusText.set('Aun no hay QR cargado.');
  }
}
