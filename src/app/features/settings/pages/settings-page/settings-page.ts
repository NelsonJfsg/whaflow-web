import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { LoggedSessionInfo, SettingsService } from '../../services/settings.service';

@Component({
  selector: 'settings-page',
  imports: [],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage implements OnInit {
  private readonly settingsService = inject(SettingsService);

  protected readonly qrImageSrc = signal<string>('');
  protected readonly qrStatusText = signal<string>('Aun no hay QR cargado.');
  protected readonly qrError = signal<string>('');
  protected readonly isLoadingQr = signal<boolean>(false);
  protected readonly loggedSession = signal<LoggedSessionInfo | null>(null);

  ngOnInit(): void {
    this.loadQr();
  }

  protected loadQr(): void {
    if (this.isLoadingQr()) {
      return;
    }

    this.isLoadingQr.set(true);
    this.qrError.set('');
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
            return;
          }

          this.loggedSession.set(null);
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
          this.qrImageSrc.set('');
          this.qrError.set('No fue posible conectar con http://localhost:3001/device/login.');
          this.qrStatusText.set('Error al generar QR.');
        },
      });
  }
}
