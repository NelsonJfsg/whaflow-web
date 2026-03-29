import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface SentMessageItem {
  id: number;
  scheduledTaskId: number;
  recipientName: string;
  recipientPhone: string;
  isForwarded: boolean;
  message: string;
  frequencyInMinutes: number;
  status: string;
  statusCode: number;
  responseBody: unknown;
  error: unknown;
  createdAt: string;
}

interface SentMessagesResponse {
  total: number;
  results: SentMessageItem[];
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly httpClient = inject(HttpClient);

  private readonly messagesEndpoint = `${environment.apiCore}/messages`;

  getSentMessages(): Observable<unknown> {
    return this.httpClient.get(this.messagesEndpoint);
  }

  normalizeSentMessages(payload: unknown): SentMessagesResponse {
    const root = this.asRecord(payload);
    if (!root) {
      return { total: 0, results: [] };
    }

    const rawResults = root['results'];
    const results = Array.isArray(rawResults)
      ? rawResults.map((item) => this.toSentMessageItem(item)).filter((item): item is SentMessageItem => item !== null)
      : [];

    const total = this.firstNumber(root, ['total']) ?? results.length;

    return {
      total,
      results,
    };
  }

  private toSentMessageItem(value: unknown): SentMessageItem | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    return {
      id: this.firstNumber(record, ['id']) ?? 0,
      scheduledTaskId: this.firstNumber(record, ['scheduledTaskId', 'scheduled_task_id']) ?? 0,
      recipientName: this.firstString(record, ['recipientName', 'recipient_name']) || 'Sin nombre',
      recipientPhone: this.firstString(record, ['recipientPhone', 'recipient_phone']) || 'Sin telefono',
      isForwarded: this.firstBoolean(record, ['isForwarded', 'is_forwarded']) ?? false,
      message: this.firstString(record, ['message']) || '',
      frequencyInMinutes: this.firstNumber(record, ['frequencyInMinutes', 'frequency_in_minutes']) ?? 0,
      status: this.firstString(record, ['status']) || 'UNKNOWN',
      statusCode: this.firstNumber(record, ['statusCode', 'status_code']) ?? 0,
      responseBody: record['responseBody'] ?? record['response_body'] ?? null,
      error: record['error'] ?? null,
      createdAt: this.firstString(record, ['createdAt', 'created_at']) || '',
    };
  }

  private firstString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    return null;
  }

  private firstNumber(source: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
      }
      if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10);
        if (Number.isInteger(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  private firstBoolean(source: Record<string, unknown>, keys: string[]): boolean | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'boolean') {
        return value;
      }
    }

    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }
}