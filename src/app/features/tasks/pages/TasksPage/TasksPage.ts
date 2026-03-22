import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { finalize } from 'rxjs';
import { ScheduledTaskItem, TasksService, WhatsAppGroup } from '../../services/tasks.service';

type FrequencyOption = 15 | 30 | 60 | 'custom';
type RecipientType = 'private' | 'group';
const TIME_24H_FORMAT = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface Recipient {
  name: string;
  phone: string;
}

interface ScheduledTaskCard {
  id: string;
  jobName: string;
  message: string;
  frequency: number;
  recipients: Array<{ name: string; phone: string }>;
  status: string;
  isForwarded: boolean;
  nextRunAt: string;
  lastRunAt: string;
  createdAt: string;
  runsCount: number;
  lastError: string;
  isActive: boolean;
  deactivatedAt: string;
}

@Component({
  selector: 'tasks-page',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: './TasksPage.html',
  styleUrl: './TasksPage.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TasksPage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly tasksService = inject(TasksService);

  protected readonly schedulerForm = this.formBuilder.nonNullable.group({
    message: [
      'Hola {name}. Solo un recordatorio: tu sesion programada inicia en 15 minutos. Nos vemos pronto.',
      [Validators.required, Validators.minLength(10)],
    ],
    repeat: this.formBuilder.nonNullable.control<boolean>(true),
    frequency: this.formBuilder.nonNullable.control<number>(15, [Validators.required, Validators.min(0)]),
    frequencyOption: this.formBuilder.nonNullable.control<FrequencyOption>(15),
    useSendWindow: this.formBuilder.nonNullable.control<boolean>(false),
    sendWindowStart: this.formBuilder.nonNullable.control<string>('08:00', [Validators.pattern(TIME_24H_FORMAT)]),
    sendWindowEnd: this.formBuilder.nonNullable.control<string>('18:00', [Validators.pattern(TIME_24H_FORMAT)]),
    recipientType: this.formBuilder.nonNullable.control<RecipientType>('private'),
    groupId: this.formBuilder.nonNullable.control<string>(''),
    recipientName: ['', [Validators.minLength(2)]],
    recipientPhone: ['', [Validators.pattern(/^\+?[0-9\s()-]{7,20}$/)]],
    recipients: this.formBuilder.nonNullable.array([
      this.formBuilder.nonNullable.group({
        name: ['Johnathan Doe', [Validators.required, Validators.minLength(2)]],
        phone: ['5216623773648', [Validators.required, Validators.pattern(/^\+?[0-9\s()-]{7,20}$/)]],
      }),
    ]),
  });

  protected readonly placeholders = ['{name}', '{date}', '{time}'];
  protected readonly frequencies: Array<{ label: string; value: FrequencyOption }> = [
    { label: 'Cada 15 min', value: 15 },
    { label: 'Cada 30 min', value: 30 },
    { label: 'Cada 60 min', value: 60 },
    { label: 'Personalizado', value: 'custom' },
  ];

  protected readonly saveFeedback = signal<string>('');
  protected readonly isSending = signal<boolean>(false);
  protected readonly isLoadingScheduled = signal<boolean>(false);
  protected readonly scheduledLoadError = signal<string>('');
  protected readonly scheduledTasks = signal<ScheduledTaskCard[]>([]);
  protected readonly availableGroups = signal<WhatsAppGroup[]>([]);
  protected readonly isLoadingGroups = signal<boolean>(false);
  private readonly hasLoadedGroups = signal<boolean>(false);
  protected readonly groupsLoadError = signal<string>('');
  protected readonly isGroupModalOpen = signal<boolean>(false);
  protected readonly actionTaskId = signal<string>('');
  private readonly lastRepeatFrequency = signal<number>(15);

  protected get recipientsArray(): FormArray {
    return this.schedulerForm.controls.recipients;
  }

  protected readonly hasScheduledTasks = computed(() => this.scheduledTasks().length > 0);
  protected readonly hasGroups = computed(() => this.availableGroups().length > 0);
  protected selectedGroup(): WhatsAppGroup | null {
    const groupId = this.schedulerForm.controls.groupId.value;
    if (!groupId) {
      return null;
    }

    return this.availableGroups().find((group) => group.JID === groupId) ?? null;
  }

  protected readonly previewMessage = computed(() => {
    const draft = this.schedulerForm.controls.message.value.trim();
    const baseMessage =
      draft.length > 0
        ? draft
        : 'Hola {name}. Tu recordatorio automatico para {date} a las {time} esta listo.';

    return baseMessage
      .replaceAll('{name}', 'Johnathan')
      .replaceAll('{date}', 'Monday')
      .replaceAll('{time}', '09:00');
  });

  protected get isCustomFrequencySelected(): boolean {
    return this.schedulerForm.controls.repeat.value && this.schedulerForm.controls.frequencyOption.value === 'custom';
  }

  protected get canUseSendWindow(): boolean {
    return this.schedulerForm.controls.repeat.value;
  }

  protected toggleSendWindow(enabled: boolean): void {
    this.schedulerForm.controls.useSendWindow.setValue(enabled);
  }

  protected updateSendWindowStart(value: string): void {
    this.schedulerForm.controls.sendWindowStart.setValue(value);
  }

  protected updateSendWindowEnd(value: string): void {
    this.schedulerForm.controls.sendWindowEnd.setValue(value);
  }

  protected get hasSendWindowRangeError(): boolean {
    const { sendWindowStart, sendWindowEnd, useSendWindow } = this.schedulerForm.controls;
    if (!this.canUseSendWindow || !useSendWindow.value) {
      return false;
    }

    const start = sendWindowStart.value.trim();
    const end = sendWindowEnd.value.trim();
    if (!TIME_24H_FORMAT.test(start) || !TIME_24H_FORMAT.test(end)) {
      return false;
    }

    const interacted =
      sendWindowStart.touched || sendWindowEnd.touched || sendWindowStart.dirty || sendWindowEnd.dirty;

    return interacted && !this.isStartTimeBeforeEndTime(start, end);
  }

  ngOnInit(): void {
    this.loadScheduledTasks();
  }

  protected insertPlaceholder(token: string, messageField: HTMLTextAreaElement): void {
    const currentMessage = this.schedulerForm.controls.message.value;
    const start = messageField.selectionStart ?? currentMessage.length;
    const end = messageField.selectionEnd ?? currentMessage.length;
    const nextValue = `${currentMessage.slice(0, start)}${token}${currentMessage.slice(end)}`;

    this.schedulerForm.controls.message.setValue(nextValue);

    queueMicrotask(() => {
      messageField.focus();
      const nextCursorPosition = start + token.length;
      messageField.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  }

  protected selectRepeat(shouldRepeat: boolean): void {
    this.schedulerForm.controls.repeat.setValue(shouldRepeat);

    if (!shouldRepeat) {
      const currentFrequency = this.schedulerForm.controls.frequency.value;
      if (currentFrequency > 0) {
        this.lastRepeatFrequency.set(Math.trunc(currentFrequency));
      }
      this.schedulerForm.controls.frequency.setValue(0);
      return;
    }

    const nextFrequency = this.lastRepeatFrequency();
    this.schedulerForm.controls.frequency.setValue(nextFrequency);
    if (this.schedulerForm.controls.frequencyOption.value !== 'custom') {
      this.schedulerForm.controls.frequencyOption.setValue(nextFrequency as 15 | 30 | 60);
    }
  }

  protected selectFrequency(value: FrequencyOption): void {
    this.schedulerForm.controls.frequencyOption.setValue(value);

    if (value === 'custom') {
      const currentFrequency = this.schedulerForm.controls.frequency.value;
      if (currentFrequency <= 0) {
        this.schedulerForm.controls.frequency.setValue(this.lastRepeatFrequency());
      }
      return;
    }

    this.schedulerForm.controls.frequency.setValue(value);
    this.lastRepeatFrequency.set(value);
  }

  protected updateCustomFrequency(rawValue: string): void {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      this.schedulerForm.controls.frequency.setValue(0);
      return;
    }

    this.schedulerForm.controls.frequency.setValue(parsed);
    this.lastRepeatFrequency.set(parsed);
  }

  protected selectRecipientType(value: RecipientType): void {
    const currentType = this.schedulerForm.controls.recipientType.value;
    if (currentType === value) {
      return;
    }

    this.resetPrivateRecipientSelection();
    this.resetGroupSelection();
    this.schedulerForm.controls.recipientType.setValue(value);

    if (value === 'group') {
      this.loadMyGroups();
      this.saveFeedback.set('Selecciona un grupo para continuar.');
    } else {
      this.saveFeedback.set('Agrega un destinatario privado para continuar.');
    }
  }

  protected openGroupSelector(): void {
    this.isGroupModalOpen.set(true);
  }

  protected closeGroupSelector(): void {
    this.isGroupModalOpen.set(false);
  }

  protected selectGroup(group: WhatsAppGroup): void {
    this.schedulerForm.controls.groupId.setValue(group.JID);
    this.groupsLoadError.set('');
    this.isGroupModalOpen.set(false);
  }

  protected clearSelectedGroup(): void {
    this.schedulerForm.controls.groupId.setValue('');
  }

  protected trackGroup(index: number, group: WhatsAppGroup): string {
    return group.JID || `${index}`;
  }

  protected addRecipient(): void {
    const { recipientName, recipientPhone } = this.schedulerForm.controls;

    recipientName.markAsTouched();
    recipientPhone.markAsTouched();

    if (recipientName.invalid || recipientPhone.invalid) {
      return;
    }

    const nextRecipient: Recipient = {
      name: recipientName.value.trim(),
      phone: recipientPhone.value.trim(),
    };

    this.recipientsArray.push(
      this.formBuilder.nonNullable.group({
        name: [nextRecipient.name, [Validators.required, Validators.minLength(2)]],
        phone: [nextRecipient.phone, [Validators.required, Validators.pattern(/^\+?[0-9\s()-]{7,20}$/)]],
      }),
    );

    recipientName.setValue('');
    recipientPhone.setValue('');
  }

  protected removeRecipient(index: number): void {
    this.recipientsArray.removeAt(index);
  }

  protected recipientInitials(name: string): string {
    const [first, second] = name.trim().split(/\s+/, 2);
    return `${first?.charAt(0) ?? ''}${second?.charAt(0) ?? ''}`.toUpperCase() || 'NA';
  }

  protected saveSchedule(): void {
    if (this.schedulerForm.invalid) {
      this.schedulerForm.markAllAsTouched();
      this.saveFeedback.set('Complete los campos obligatorios antes de guardar.');
      return;
    }

    const recipientType = this.schedulerForm.controls.recipientType.value;

    if (recipientType === 'private') {
      if (this.recipientsArray.length === 0) {
        this.saveFeedback.set('Agrega al menos un destinatario antes de enviar.');
        return;
      }

      if (this.recipientsArray.invalid) {
        this.recipientsArray.markAllAsTouched();
        this.saveFeedback.set('Hay destinatarios con datos invalidos.');
        return;
      }
    } else if (!this.schedulerForm.controls.groupId.value.trim()) {
      this.saveFeedback.set('Selecciona un grupo antes de enviar.');
      return;
    }

    const shouldRepeat = this.schedulerForm.controls.repeat.value;
    const rawFrequency = this.schedulerForm.controls.frequency.value;
    const isFrequencyValid = Number.isInteger(rawFrequency) && rawFrequency > 0;

    if (shouldRepeat && !isFrequencyValid) {
      this.schedulerForm.controls.frequency.markAsTouched();
      this.saveFeedback.set('La frecuencia debe ser un numero entero mayor a 0.');
      return;
    }

    const frequency = shouldRepeat ? rawFrequency : 0;
    const sendWindow = this.buildSendWindow(shouldRepeat);
    if (sendWindow === null) {
      this.saveFeedback.set('La ventana de envio es invalida. Verifica hora inicio y fin.');
      return;
    }

    const selectedGroup = this.selectedGroup();

    const recipients =
      recipientType === 'group'
        ? [
            {
              name: selectedGroup?.Name?.trim() || 'Grupo',
              phone: this.schedulerForm.controls.groupId.value.trim(),
            },
          ]
        : this.recipientsArray.getRawValue().map((recipient: Recipient) => ({
            name: recipient.name.trim(),
            phone: this.toWhatsappJid(recipient.phone),
          }));

    const payload = {
      is_forwarded: false,
      message: this.schedulerForm.controls.message.value.trim(),
      frequency,
      ...(sendWindow ? { send_window: sendWindow } : {}),
      recipients,
    };

    this.isSending.set(true);
    this.saveFeedback.set('Enviando mensaje...');

    this.tasksService
      .sendMessage(payload)
      .pipe(finalize(() => this.isSending.set(false)))
      .subscribe({
        next: () => {
          this.saveFeedback.set('Mensaje enviado correctamente.');
          this.loadScheduledTasks();
        },
        error: () => {
          this.saveFeedback.set('No se pudo enviar el mensaje. Verifica el servicio en localhost:3000.');
        },
      });
  }

  protected trackScheduledTask(index: number, task: ScheduledTaskCard): string {
    return task.id || `${index}`;
  }

  protected frequencyLabel(frequency: number): string {
    if (frequency <= 0) {
      return 'Una sola vez';
    }

    return `Cada ${frequency} min`;
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

  private loadScheduledTasks(): void {
    this.isLoadingScheduled.set(true);
    this.scheduledLoadError.set('');

    this.tasksService
      .getScheduledTasks()
      .pipe(finalize(() => this.isLoadingScheduled.set(false)))
      .subscribe({
        next: (response) => {
          const normalized = this.tasksService.normalizeScheduledTasks(response);
          this.scheduledTasks.set(normalized.map((task) => this.toCardModel(task)));
        },
        error: () => {
          this.scheduledTasks.set([]);
          this.scheduledLoadError.set('No fue posible cargar las tareas programadas.');
        },
      });
  }

  private toCardModel(task: ScheduledTaskItem): ScheduledTaskCard {
    return {
      id: task.id,
      jobName: task.jobName,
      message: task.message,
      frequency: task.frequency,
      recipients: task.recipients,
      status: task.status,
      isForwarded: task.isForwarded,
      nextRunAt: task.nextRunAt,
      lastRunAt: task.lastRunAt,
      createdAt: task.createdAt,
      runsCount: task.runsCount,
      lastError: task.lastError,
      isActive: task.isActive,
      deactivatedAt: task.deactivatedAt,
    };
  }

  protected toggleRepetition(task: ScheduledTaskCard): void {
    if (task.frequency <= 0) {
      return;
    }

    const action = task.isActive ? 'deactivate' : 'activate';
    const feedbackPrefix = task.isActive ? 'Desactivando' : 'Activando';
    const successMessage = task.isActive
      ? 'Tarea desactivada correctamente.'
      : 'Tarea activada correctamente.';

    this.actionTaskId.set(task.id);
    this.saveFeedback.set(`${feedbackPrefix} tarea...`);

    this.tasksService
      .updateScheduledTaskActionById(task.id, action)
      .pipe(finalize(() => this.actionTaskId.set('')))
      .subscribe({
        next: () => {
          this.saveFeedback.set(successMessage);
          this.loadScheduledTasks();
        },
        error: () => {
          this.saveFeedback.set('No se pudo actualizar la tarea programada.');
        },
      });
  }

  protected deleteScheduledTask(task: ScheduledTaskCard): void {
    this.actionTaskId.set(task.id);
    this.saveFeedback.set('Eliminando tarea...');

    this.tasksService
      .updateScheduledTaskActionById(task.id, 'delete')
      .pipe(finalize(() => this.actionTaskId.set('')))
      .subscribe({
        next: () => {
          this.saveFeedback.set('Tarea eliminada correctamente.');
          this.loadScheduledTasks();
        },
        error: () => {
          this.saveFeedback.set('No se pudo eliminar la tarea programada.');
        },
      });
  }

  protected isTaskActionRunning(task: ScheduledTaskCard): boolean {
    return this.actionTaskId() === task.id;
  }

  private loadMyGroups(): void {
    if (this.hasLoadedGroups()) {
      return;
    }

    if (this.isLoadingGroups()) {
      return;
    }

    this.isLoadingGroups.set(true);
    this.groupsLoadError.set('');

    this.tasksService
      .getMyGroups()
      .pipe(finalize(() => this.isLoadingGroups.set(false)))
      .subscribe({
        next: (response) => {
          const groups = this.tasksService.normalizeMyGroups(response);
          this.availableGroups.set(groups);
          this.hasLoadedGroups.set(true);

          if (groups.length === 0) {
            this.groupsLoadError.set('No se encontraron grupos disponibles.');
            return;
          }

          const selectedId = this.schedulerForm.controls.groupId.value;
          const groupIsStillAvailable = groups.some((group) => group.JID === selectedId);
          if (!groupIsStillAvailable) {
            this.schedulerForm.controls.groupId.setValue('');
          }
        },
        error: () => {
          this.availableGroups.set([]);
          this.hasLoadedGroups.set(false);
          this.schedulerForm.controls.groupId.setValue('');
          this.groupsLoadError.set('No fue posible cargar tus grupos. Verifica el endpoint /groups/my.');
        },
      });
  }

  private resetPrivateRecipientSelection(): void {
    while (this.recipientsArray.length > 0) {
      this.recipientsArray.removeAt(0);
    }

    this.schedulerForm.controls.recipientName.setValue('');
    this.schedulerForm.controls.recipientPhone.setValue('');
    this.schedulerForm.controls.recipientName.markAsUntouched();
    this.schedulerForm.controls.recipientPhone.markAsUntouched();
  }

  private resetGroupSelection(): void {
    this.isGroupModalOpen.set(false);
    this.schedulerForm.controls.groupId.setValue('');
  }

  private buildSendWindow(shouldRepeat: boolean): { start: string; end: string } | null | undefined {
    const useSendWindow = this.schedulerForm.controls.useSendWindow.value;
    if (!shouldRepeat || !useSendWindow) {
      return undefined;
    }

    const start = this.schedulerForm.controls.sendWindowStart.value.trim();
    const end = this.schedulerForm.controls.sendWindowEnd.value.trim();

    const startIsValid = TIME_24H_FORMAT.test(start);
    const endIsValid = TIME_24H_FORMAT.test(end);

    if (!startIsValid || !endIsValid) {
      this.schedulerForm.controls.sendWindowStart.markAsTouched();
      this.schedulerForm.controls.sendWindowEnd.markAsTouched();
      return null;
    }

    if (!this.isStartTimeBeforeEndTime(start, end)) {
      this.schedulerForm.controls.sendWindowStart.markAsTouched();
      this.schedulerForm.controls.sendWindowEnd.markAsTouched();
      return null;
    }

    return { start, end };
  }

  private isStartTimeBeforeEndTime(start: string, end: string): boolean {
    const toMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map((value) => Number.parseInt(value, 10));
      return hours * 60 + minutes;
    };

    return toMinutes(start) < toMinutes(end);
  }

  private toWhatsappJid(rawPhone: string): string {
    const trimmed = rawPhone.trim();
    if (trimmed.includes('@')) {
      return trimmed;
    }

    const digitsOnly = trimmed.replace(/\D/g, '');
    return `${digitsOnly}@s.whatsapp.net`;
  }
}
