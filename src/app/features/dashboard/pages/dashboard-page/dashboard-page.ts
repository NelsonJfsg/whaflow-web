import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { finalize } from 'rxjs';
import { DashboardService, SentMessageItem } from '../../services/dashboard.service';
import { TokenService } from '../../../../core/services/token.service';

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

type MessageTypeFilter = 'all' | 'scheduled' | 'individual';

@Component({
  selector: 'dashboard-page',
  imports: [MatDatepickerModule, MatNativeDateModule, MatFormFieldModule, MatInputModule],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly tokenService = inject(TokenService);
  private readonly activeUserScope = signal<string>('anonymous');

  protected readonly isLoadingMessages = signal<boolean>(false);
  protected readonly loadError = signal<string>('');
  protected readonly totalMessagesFromApi = signal<number>(0);
  protected readonly sentMessages = signal<SentMessageCard[]>([]);
  protected readonly selectedDate = signal<Date | null>(null);
  protected readonly selectedMessageType = signal<MessageTypeFilter>('all');
  protected readonly selectedScheduledTaskId = signal<string>('all');
  protected readonly selectedGroupJid = signal<string>('all');
  protected readonly currentPage = signal<number>(1);
  protected readonly pageSize = signal<number>(9);
  protected readonly pageSizeOptions = [6, 9, 12, 24];

  protected readonly hasMessages = computed(() => this.filteredMessages().length > 0);
  protected readonly hasAnyMessages = computed(() => this.sentMessages().length > 0);
  protected readonly filteredMessages = computed(() => {
    const dateFilter = this.selectedDate();
    const messageTypeFilter = this.selectedMessageType();
    const scheduledTaskFilter = this.selectedScheduledTaskId();
    const groupFilter = this.selectedGroupJid();

    return this.sentMessages().filter((item) => {
      if (dateFilter && this.toDateKey(item.createdAt) !== this.toDateKeyFromDate(dateFilter)) {
        return false;
      }

      if (messageTypeFilter === 'scheduled' && !this.isScheduledMessage(item)) {
        return false;
      }

      if (messageTypeFilter === 'individual' && this.isScheduledMessage(item)) {
        return false;
      }

      if (scheduledTaskFilter !== 'all' && `${item.scheduledTaskId}` !== scheduledTaskFilter) {
        return false;
      }

      if (groupFilter !== 'all' && item.recipientPhone.trim() !== groupFilter) {
        return false;
      }

      return true;
    });
  });
  protected readonly totalFilteredMessages = computed(() => this.filteredMessages().length);
  protected readonly selectedDateLabel = computed(() => {
    const date = this.selectedDate();
    if (!date) {
      return '';
    }

    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
    }).format(date);
  });
  protected readonly totalPages = computed(() => {
    const total = this.totalFilteredMessages();
    const size = this.pageSize();
    return Math.max(1, Math.ceil(total / size));
  });
  protected readonly paginatedMessages = computed(() => {
    const totalPages = this.totalPages();
    const safePage = Math.min(Math.max(this.currentPage(), 1), totalPages);
    const pageSize = this.pageSize();
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    return this.filteredMessages().slice(start, end);
  });
  protected readonly canGoPrevious = computed(() => this.currentPage() > 1);
  protected readonly canGoNext = computed(() => this.currentPage() < this.totalPages());
  protected readonly scheduledTaskOptions = computed(() => {
    const unique = new Map<number, number>();
    for (const item of this.sentMessages()) {
      if (!this.isScheduledMessage(item)) {
        continue;
      }

      unique.set(item.scheduledTaskId, item.scheduledTaskId);
    }

    return Array.from(unique.values()).sort((a, b) => a - b);
  });
  protected readonly groupOptions = computed(() => {
    const unique = new Map<string, { jid: string; name: string }>();
    for (const item of this.sentMessages()) {
      if (!this.isGroupRecipient(item.recipientPhone)) {
        continue;
      }

      const jid = item.recipientPhone.trim();
      if (!unique.has(jid)) {
        unique.set(jid, {
          jid,
          name: item.recipientName.trim() || jid,
        });
      }
    }

    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  });
  protected readonly successCount = computed(
    () => this.filteredMessages().filter((item) => item.status.toUpperCase() === 'SUCCESS').length,
  );
  protected readonly failedCount = computed(
    () => this.filteredMessages().filter((item) => item.status.toUpperCase() !== 'SUCCESS').length,
  );

  ngOnInit(): void {
    this.syncUserScope(true);
    this.loadSentMessages();
  }

  protected reload(): void {
    this.loadSentMessages();
  }

  protected clearFilters(): void {
    this.selectedDate.set(null);
    this.selectedMessageType.set('all');
    this.selectedScheduledTaskId.set('all');
    this.selectedGroupJid.set('all');
    this.currentPage.set(1);
  }

  protected updateDateFilter(value: Date | null): void {
    this.selectedDate.set(value);
    this.currentPage.set(1);
  }

  protected preventDateTyping(event: KeyboardEvent): void {
    event.preventDefault();
  }

  protected updateMessageTypeFilter(value: string): void {
    if (value !== 'all' && value !== 'scheduled' && value !== 'individual') {
      return;
    }

    this.selectedMessageType.set(value);
    this.currentPage.set(1);

    if (value === 'individual') {
      this.selectedScheduledTaskId.set('all');
    }
  }

  protected updateScheduledTaskFilter(value: string): void {
    this.selectedScheduledTaskId.set(value || 'all');
    this.currentPage.set(1);
  }

  protected updateGroupFilter(value: string): void {
    this.selectedGroupJid.set(value || 'all');
    this.currentPage.set(1);
  }

  protected updatePageSize(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return;
    }

    this.pageSize.set(parsed);
    this.currentPage.set(1);
  }

  protected goToPreviousPage(): void {
    if (!this.canGoPrevious()) {
      return;
    }

    this.currentPage.update((value) => value - 1);
  }

  protected goToNextPage(): void {
    if (!this.canGoNext()) {
      return;
    }

    this.currentPage.update((value) => value + 1);
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
    this.syncUserScope();

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
          this.currentPage.set(1);
        },
        error: () => {
          this.totalMessagesFromApi.set(0);
          this.sentMessages.set([]);
          this.loadError.set('No fue posible cargar los mensajes enviados desde /messages.');
        },
      });
  }

  private syncUserScope(forceReset = false): void {
    const nextScope = this.tokenService.getUserScopeKey();
    const previousScope = this.activeUserScope();
    if (!forceReset && nextScope === previousScope) {
      return;
    }

    this.activeUserScope.set(nextScope);
    this.totalMessagesFromApi.set(0);
    this.sentMessages.set([]);
    this.selectedDate.set(null);
    this.selectedMessageType.set('all');
    this.selectedScheduledTaskId.set('all');
    this.selectedGroupJid.set('all');
    this.currentPage.set(1);
    this.loadError.set('');
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

  private isScheduledMessage(item: SentMessageCard): boolean {
    return item.frequencyInMinutes >= 1;
  }

  private isGroupRecipient(recipientPhone: string): boolean {
    return recipientPhone.includes('@g.us');
  }

  private toDateKey(dateValue: string): string {
    if (!dateValue) {
      return '';
    }

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
    const day = `${parsed.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toDateKeyFromDate(dateValue: Date): string {
    const year = dateValue.getFullYear();
    const month = `${dateValue.getMonth() + 1}`.padStart(2, '0');
    const day = `${dateValue.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
