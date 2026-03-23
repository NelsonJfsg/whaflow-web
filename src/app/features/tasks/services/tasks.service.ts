
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface PrivateRecipientPayload {
  name: string;
  phone: string;
}

interface SendMessagePayload {
  is_forwarded: boolean;
  message: string;
  frequency: number;
  send_window?: {
    start: string;
    end: string;
  };
  recipients: PrivateRecipientPayload[];
}

export interface WhatsAppGroupParticipant {
  JID: string;
  PhoneNumber: string;
  LID: string;
  IsAdmin: boolean;
  IsSuperAdmin: boolean;
  DisplayName: string;
  Error: number;
  AddRequest: unknown | null;
}

export interface WhatsAppGroup {
  JID: string;
  OwnerJID: string;
  OwnerPN: string;
  Name: string;
  NameSetAt: string;
  NameSetBy: string;
  NameSetByPN: string;
  Topic: string;
  TopicID: string;
  TopicSetAt: string;
  TopicSetBy: string;
  TopicSetByPN: string;
  TopicDeleted: boolean;
  IsLocked: boolean;
  IsAnnounce: boolean;
  AnnounceVersionID: string;
  IsEphemeral: boolean;
  DisappearingTimer: number;
  IsIncognito: boolean;
  IsParent: boolean;
  DefaultMembershipApprovalMode: string;
  LinkedParentJID: string;
  IsDefaultSubGroup: boolean;
  IsJoinApprovalRequired: boolean;
  AddressingMode: string;
  GroupCreated: string;
  CreatorCountryCode: string;
  ParticipantVersionID: string;
  Participants: WhatsAppGroupParticipant[];
  ParticipantCount: number;
  MemberAddMode: string;
  Suspended: boolean;
}

export interface GroupsApiResponse {
  code: string;
  message: string;
  results: {
    data: WhatsAppGroup[];
  };
}

export interface MyGroupsResponse {
  code: string;
  message: string;
  total: number;
  groups: WhatsAppGroup[];
}

export interface ScheduledTaskItem {
  id: string;
  jobName: string;
  message: string;
  frequency: number;
  status: string;
  isForwarded: boolean;
  recipients: Array<{ name: string; phone: string }>;
  nextRunAt: string;
  lastRunAt: string;
  createdAt: string;
  runsCount: number;
  lastError: string;
  isActive: boolean;
  deactivatedAt: string;
}

type ScheduledTaskAction = 'activate' | 'deactivate' | 'delete';

@Injectable({
  providedIn: 'root'
})
export class TasksService {
  private readonly httpClient = inject(HttpClient);

  private readonly endpoint = `${environment.apiCore}/tasks/send-message`;
  private readonly scheduledEndpoint = `${environment.apiCore}/tasks/scheduled`;
  private readonly groupsEndpoint = `${environment.apiCore}/groups/my`;
  private readonly authToken = 'Basic bmVsc29uamZzZzpuZWxzb24xMjQh';

  private readonly headers = new HttpHeaders({
    Authorization: this.authToken,
    'Content-Type': 'application/json',
  });

  sendMessage(payload: SendMessagePayload): Observable<unknown> {
    return this.httpClient.post(this.endpoint, payload, { headers: this.headers });
  }

  getScheduledTasks(): Observable<unknown> {
    return this.httpClient.get(this.scheduledEndpoint, { headers: this.headers });
  }

  getMyGroups(): Observable<unknown> {
    return this.httpClient.get(this.groupsEndpoint, { headers: this.headers });
  }

  updateScheduledTaskActionById(id: string, action: ScheduledTaskAction): Observable<unknown> {
    const target = `${this.scheduledEndpoint}/${encodeURIComponent(id)}/action`;
    return this.httpClient.patch(target, { action }, { headers: this.headers });
  }

  normalizeScheduledTasks(payload: unknown): ScheduledTaskItem[] {
    const list = this.extractTaskList(payload);

    return list.map((item, index) => this.normalizeTask(item, index));
  }

  normalizeMyGroups(payload: unknown): WhatsAppGroup[] {
    const response = this.asRecord(payload);
    if (!response) {
      return [];
    }

    const groupsFromResults = this.asRecord(response['results'])?.['data'];
    if (Array.isArray(groupsFromResults)) {
      return groupsFromResults.filter((item): item is WhatsAppGroup => this.isWhatsAppGroup(item));
    }

    const groups = response['groups'];
    if (Array.isArray(groups)) {
      return groups.filter((item): item is WhatsAppGroup => this.isWhatsAppGroup(item));
    }

    return [];
  }

  private extractTaskList(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    const data = this.asRecord(payload);
    if (!data) {
      return [];
    }

    const possibleArrays = [data['tasks'], data['data'], data['items'], data['result']];
    for (const candidate of possibleArrays) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  private normalizeTask(task: unknown, index: number): ScheduledTaskItem {
    const record = this.asRecord(task);
    if (!record) {
      return {
        id: `task-${index + 1}`,
        jobName: '',
        message: '',
        frequency: 0,
        status: 'unknown',
        isForwarded: false,
        recipients: [],
        nextRunAt: '',
        lastRunAt: '',
        createdAt: '',
        runsCount: 0,
        lastError: '',
        isActive: false,
        deactivatedAt: '',
      };
    }

    const recipients = this.parseRecipients(record['recipients'] ?? record['phones'] ?? record['targets']);
    const jobName = this.firstString(record, ['jobName', 'job_name']) || '';
    const createdAt = this.firstDateString(record, ['created_at', 'createdAt']);
    const lastRunAt = this.firstDateString(record, ['last_run_at', 'lastRunAt', 'lastExecutionAt']);
    const nextRunAt = this.firstDateString(record, ['next_run_at', 'nextRunAt', 'runAt', 'scheduledFor']);

    return {
      id:
        this.firstString(record, ['id', '_id', 'taskId', 'uuid']) ||
        this.firstNumber(record, ['id', '_id', 'taskId'])?.toString() ||
        jobName ||
        `task-${index + 1}`,
      jobName,
      message: this.firstString(record, ['message', 'text', 'body']) || '',
      frequency: this.firstNumber(record, ['frequencyInMinutes', 'frequency', 'interval', 'intervalMinutes', 'every']) ?? 0,
      status: this.firstString(record, ['status', 'state']) || ((this.firstBoolean(record, ['isActive']) ?? true) ? 'active' : 'inactive'),
      isForwarded: this.firstBoolean(record, ['is_forwarded', 'isForwarded']) ?? false,
      recipients,
      nextRunAt,
      lastRunAt,
      createdAt,
      runsCount: this.firstNumber(record, ['runsCount', 'runs_count']) ?? 0,
      lastError: this.firstString(record, ['lastError', 'last_error']) || '',
      isActive: this.firstBoolean(record, ['isActive', 'active']) ?? true,
      deactivatedAt: this.firstDateString(record, ['deactivatedAt', 'deactivated_at']),
    };
  }

  private parseRecipients(raw: unknown): Array<{ name: string; phone: string }> {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((entry, index) => {
        if (typeof entry === 'string') {
          return { name: `Destinatario ${index + 1}`, phone: entry };
        }

        const record = this.asRecord(entry);
        if (!record) {
          return null;
        }

        const phone = this.firstString(record, ['phone', 'jid', 'to']) || '';
        const name = this.firstString(record, ['name', 'displayName']) || `Destinatario ${index + 1}`;

        if (!phone) {
          return null;
        }

        return { name, phone };
      })
      .filter((item): item is { name: string; phone: string } => item !== null);
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

  private firstDateString(source: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = source[key];

      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }

      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
      }

      if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value).toISOString();
      }
    }

    return '';
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private isWhatsAppGroup(value: unknown): value is WhatsAppGroup {
    const record = this.asRecord(value);
    return !!record && typeof record['JID'] === 'string' && typeof record['Name'] === 'string';
  }

}
