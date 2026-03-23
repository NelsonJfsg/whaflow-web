import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { DashboardService, SentMessageItem } from '../../services/dashboard.service';

interface SentMessageCard {
  id: number;
  scheduledTaskId: number;
  recipientName: string;
  recipientPhone: string;
  isForwarded: boolean;
  message: string;
  frequencyInMinutes: number;
  status: string;
  statusCode: number;
  createdAt: string;
  error: string;
}

@Component({
  selector: 'dashboard-page',
  imports: [],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage implements OnInit {
  private readonly dashboardService = inject(DashboardService);

  protected readonly isLoadingMessages = signal<boolean>(false);
  protected readonly loadError = signal<string>('');
  protected readonly totalMessagesFromApi = signal<number>(0);
  protected readonly sentMessages = signal<SentMessageCard[]>([]);

  protected readonly hasMessages = computed(() => this.sentMessages().length > 0);
  protected readonly successCount = computed(
    () => this.sentMessages().filter((item) => item.status.toUpperCase() === 'SUCCESS').length,
  );
  protected readonly failedCount = computed(
    () => this.sentMessages().filter((item) => item.status.toUpperCase() !== 'SUCCESS').length,
  );

  ngOnInit(): void {
    this.loadSentMessages();
  }

  protected reload(): void {
    this.loadSentMessages();
  }

  protected trackMessage(index: number, message: SentMessageCard): string {
    return `${message.id}-${index}`;
  }

  protected formatDate(dateValue: string): string {
    if (!dateValue) {
      return 'No disponible';
    }

    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) {
      return dateValue;
    }

    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsedDate);
  }

  private loadSentMessages(): void {
    if (this.isLoadingMessages()) {
      return;
    }

    this.isLoadingMessages.set(true);
    this.loadError.set('');

    this.dashboardService
      .getSentMessages()
      .pipe(finalize(() => this.isLoadingMessages.set(false)))
      .subscribe({
        next: (response) => {
          const normalized = this.dashboardService.normalizeSentMessages(response);
          this.totalMessagesFromApi.set(normalized.total);
          this.sentMessages.set(normalized.results.map((item) => this.toCard(item)));
        },
        error: () => {
          this.totalMessagesFromApi.set(0);
          this.sentMessages.set([]);
          this.loadError.set('No fue posible cargar los mensajes enviados desde /messages.');
        },
      });
  }

  private toCard(item: SentMessageItem): SentMessageCard {
    return {
      id: item.id,
      scheduledTaskId: item.scheduledTaskId,
      recipientName: item.recipientName,
      recipientPhone: item.recipientPhone,
      isForwarded: item.isForwarded,
      message: item.message,
      frequencyInMinutes: item.frequencyInMinutes,
      status: item.status,
      statusCode: item.statusCode,
      createdAt: item.createdAt,
      error: typeof item.error === 'string' ? item.error : '',
    };
  }
}
