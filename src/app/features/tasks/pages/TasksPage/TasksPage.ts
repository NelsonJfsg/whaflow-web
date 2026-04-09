import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { finalize, merge } from 'rxjs';
import { NgxMaterialTimepickerModule } from 'ngx-material-timepicker';
import { TokenService } from '../../../../core/services/token.service';
import { MxPhoneDisplayPipe } from '../../pipes/mx-phone-display.pipe';
import {
  ScheduledTaskItem,
  ScheduledTaskUpdatePayload,
  SendWindowPayload,
  TasksService,
  WhatsAppGroup,
} from '../../services/tasks.service';
import { NgClass } from '@angular/common';
import { SettingsService } from '../../../settings/services/settings.service';

type FrequencyOption = 15 | 30 | 60 | 'custom';
type RecipientType = 'private' | 'group';
const TIME_24H_FORMAT = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DEFAULT_LADA = '+52';
const FULL_DAY_WINDOW_START = '00:00';
const FULL_DAY_WINDOW_END = '23:59';

interface Recipient {
  name: string;
  phone: string;
}

interface ScheduledTaskCard {
  id: string;
  jobName: string;
  message: string;
  frequency: number;
  sendWindow?: SendWindowPayload;
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
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSnackBarModule, NgClass, NgxMaterialTimepickerModule],
  templateUrl: './TasksPage.html',
  styleUrl: './TasksPage.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TasksPage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly tasksService = inject(TasksService);
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mxPhoneDisplayPipe = new MxPhoneDisplayPipe();
  private readonly tokenService = inject(TokenService);
  private readonly activeUserScope = signal<string>('anonymous');

  protected readonly schedulerForm = this.formBuilder.nonNullable.group({
    message: ['', [Validators.required]],
    repeat: this.formBuilder.nonNullable.control<boolean>(false),
    frequency: this.formBuilder.nonNullable.control<number>(0, [Validators.required, Validators.min(0)]),
    frequencyOption: this.formBuilder.nonNullable.control<FrequencyOption>(15),
    useSendWindow: this.formBuilder.nonNullable.control<boolean>(false),
    sendWindowStart: this.formBuilder.nonNullable.control<string>('08:00', [Validators.pattern(TIME_24H_FORMAT)]),
    sendWindowEnd: this.formBuilder.nonNullable.control<string>('18:00', [Validators.pattern(TIME_24H_FORMAT)]),
    sendWindowStartAt: this.formBuilder.nonNullable.control<string>('', [Validators.pattern(TIME_24H_FORMAT)]),
    recipientType: this.formBuilder.nonNullable.control<RecipientType>('private'),
    groupId: this.formBuilder.nonNullable.control<string>(''),
    recipientLada: this.formBuilder.nonNullable.control<string>(DEFAULT_LADA, [Validators.required]),
    recipientName: ['', [Validators.minLength(2)]],
    recipientPhone: ['', [Validators.pattern(/^\d{10}$/)]],
    recipients: this.formBuilder.nonNullable.array([]),
  });

  protected readonly placeholders = ['{name}', '{date}', '{time}'];
  protected readonly frequencies: Array<{ label: string; value: FrequencyOption }> = [
    { label: 'Cada 15 min', value: 15 },
    { label: 'Cada 30 min', value: 30 },
    { label: 'Cada 60 min', value: 60 },
    { label: 'Personalizado', value: 'custom' },
  ];
  protected readonly ladas: Array<{ label: string; value: string }> = [
    { label: 'Mexico (+52)', value: '+52' },
  ];

  protected readonly saveFeedback = signal<string>('');
  protected readonly isSending = signal<boolean>(false);
  protected readonly isLoadingScheduled = signal<boolean>(false);
  protected readonly scheduledLoadError = signal<string>('');
  protected readonly scheduledTasks = signal<ScheduledTaskCard[]>([]);
  protected readonly availableGroups = signal<WhatsAppGroup[]>([]);
  protected readonly groupSearchTerm = signal<string>('');
  protected readonly isLoadingGroups = signal<boolean>(false);
  private readonly hasLoadedGroups = signal<boolean>(false);
  protected readonly groupsLoadError = signal<string>('');
  protected readonly isGroupModalOpen = signal<boolean>(false);
  protected readonly actionTaskId = signal<string>('');
  private readonly lastRepeatFrequency = signal<number>(15);
  protected readonly isDeviceLinked = signal<boolean | null>(null);
  protected readonly showDeviceWarningModal = signal<boolean>(false);
  protected readonly editingTaskId = signal<string>('');
  private readonly editingOriginalTask = signal<ScheduledTaskCard | null>(null);
  protected readonly loadingEditTaskId = signal<string>('');

  protected get recipientsArray(): FormArray {
    return this.schedulerForm.controls.recipients;
  }

  protected readonly hasScheduledTasks = computed(() => this.scheduledTasks().length > 0);
  protected readonly isEditingTask = computed(() => this.editingTaskId().length > 0);
  protected readonly hasGroups = computed(() => this.availableGroups().length > 0);
  protected readonly filteredGroups = computed(() => {
    const searchTerm = this.groupSearchTerm().trim().toLocaleLowerCase();
    if (!searchTerm) {
      return this.availableGroups();
    }

    return this.availableGroups().filter((group) => group.Name.toLocaleLowerCase().includes(searchTerm));
  });
  protected readonly hasFilteredGroups = computed(() => this.filteredGroups().length > 0);

  protected selectedGroup(): WhatsAppGroup | null {
    const groupId = this.schedulerForm.controls.groupId.value;
    if (!groupId) {
      return null;
    }

    return this.availableGroups().find((group) => group.JID === groupId) ?? null;
  }

  protected readonly previewMessage = computed(() => {
    const draft = this.schedulerForm.controls.message.value.trim();
    const baseMessage = draft.length > 0 ? draft : 'Escribe tu mensaje aqui.';

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

  protected clearSendWindowStartAt(): void {
    const control = this.schedulerForm.controls.sendWindowStartAt;
    if (control.value.trim().length === 0) {
      return;
    }

    control.setValue('');
    control.markAsDirty();
    control.markAsTouched();
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

  protected get hasSendWindowStartAtError(): boolean {
    const { sendWindowStartAt, useSendWindow } = this.schedulerForm.controls;
    if (!this.canUseSendWindow) {
      return false;
    }

    const startAt = sendWindowStartAt.value.trim();
    if (startAt.length === 0) {
      return false;
    }

    const interacted = sendWindowStartAt.touched || sendWindowStartAt.dirty || startAt.length > 0;
    if (!interacted) {
      return false;
    }

    if (!TIME_24H_FORMAT.test(startAt)) {
      return true;
    }

    if (!useSendWindow.value) {
      return false;
    }

    return !this.isSendWindowStartAtValid();
  }

  protected get canAddRecipient(): boolean {
    const lada = this.schedulerForm.controls.recipientLada.value.trim();
    const name = this.schedulerForm.controls.recipientName.value.trim();
    const phone = this.schedulerForm.controls.recipientPhone.value.trim();

    if (!lada || !name || !phone) {
      return false;
    }

    return (
      !this.schedulerForm.controls.recipientName.invalid &&
      !this.schedulerForm.controls.recipientPhone.invalid &&
      !this.schedulerForm.controls.recipientLada.invalid
    );
  }

  protected get canSubmitSchedule(): boolean {
    // Validar que dispositivo esté ligado
    if (!this.isDeviceLinked()) {
      return false;
    }

    // Si está enviando, desabilitar
    if (this.isSending()) {
      return false;
    }

    // Mensaje es requerido y no puede estar vacío
    const message = this.schedulerForm.controls.message.value.trim();
    if (message.length === 0) {
      return false;
    }

    // Validar frecuencia si está activada la repetición
    const shouldRepeat = this.schedulerForm.controls.repeat.value;
    const frequency = this.schedulerForm.controls.frequency.value;
    if (shouldRepeat && (!Number.isInteger(frequency) || frequency <= 0)) {
      return false;
    }

    // Validar ventana de envío si está activada
    if (!this.isSendWindowValidForSubmit(shouldRepeat)) {
      return false;
    }

    // Validar destinatarios basado en el tipo
    const recipientType = this.schedulerForm.controls.recipientType.value;
    
    if (recipientType === 'group') {
      // Si es grupo, debe haber un grupo seleccionado
      const groupId = this.schedulerForm.controls.groupId.value.trim();
      if (!groupId || groupId.length === 0) {
        return false;
      }
    } else {
      // Si es privado, debe haber al menos un destinatario
      const recipients = this.recipientsArray;
      if (!recipients || recipients.length === 0) {
        return false;
      }
      
      // Validar que todos los destinatarios en el array sean válidos
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients.at(i);
        if (!recipient || recipient.invalid) {
          return false;
        }
      }
    }

    if (this.isEditingTask()) {
      return this.hasPendingEditChanges();
    }

    return true;
  }

  ngOnInit(): void {
    this.syncUserScope(true);

    merge(this.schedulerForm.valueChanges, this.schedulerForm.statusChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.changeDetectorRef.markForCheck();
      });

    this.checkDeviceStatus();
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

  protected sanitizeRecipientPhoneInput(rawValue: string): void {
    const digitsOnly = rawValue.replace(/\D/g, '').slice(0, 10);
    this.schedulerForm.controls.recipientPhone.setValue(digitsOnly);
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
    this.groupSearchTerm.set('');
    this.isGroupModalOpen.set(true);
  }

  protected closeGroupSelector(): void {
    this.groupSearchTerm.set('');
    this.isGroupModalOpen.set(false);
  }

  protected updateGroupSearchTerm(rawValue: string): void {
    this.groupSearchTerm.set(rawValue);
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
    const { recipientLada, recipientName, recipientPhone } = this.schedulerForm.controls;

    recipientLada.markAsTouched();
    recipientName.markAsTouched();
    recipientPhone.markAsTouched();

    const hasAllValues =
      recipientLada.value.trim().length > 0 &&
      recipientName.value.trim().length > 0 &&
      recipientPhone.value.trim().length > 0;
    if (!hasAllValues || recipientLada.invalid || recipientName.invalid || recipientPhone.invalid) {
      return;
    }

    const normalizedPhone = this.buildRecipientPhone(recipientLada.value, recipientPhone.value);
    const nextRecipient: Recipient = {
      name: recipientName.value.trim(),
      phone: normalizedPhone,
    };

    this.recipientsArray.push(
      this.formBuilder.nonNullable.group({
        name: [nextRecipient.name, [Validators.required, Validators.minLength(2)]],
        phone: [nextRecipient.phone, [Validators.required, Validators.pattern(/^\d{11,15}$/)]],
      }),
    );

    recipientLada.setValue(DEFAULT_LADA);
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

  protected formatRecipientPhone(phone: string): string {
    return this.mxPhoneDisplayPipe.transform(phone);
  }

  protected saveSchedule(): void {
    if (this.schedulerForm.controls.message.value.trim().length === 0) {
      this.schedulerForm.controls.message.markAsTouched();
      this.saveFeedback.set('Escribe un mensaje antes de enviar.');
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

    const recipients = this.buildRecipientsPayload(recipientType);

    const payload = {
      is_forwarded: false,
      message: this.schedulerForm.controls.message.value.trim(),
      frequency,
      ...(sendWindow ? { send_window: sendWindow } : {}),
      recipients,
    };

    if (this.isEditingTask()) {
      const originalTask = this.editingOriginalTask();
      if (!originalTask) {
        this.saveFeedback.set('No fue posible cargar la tarea para editar.');
        return;
      }

      const updatePayload = this.buildUpdatePayload(originalTask, payload.message, payload.frequency, payload.recipients, sendWindow);
      if (Object.keys(updatePayload).length === 0) {
        this.saveFeedback.set('No hay cambios para guardar.');
        return;
      }

      this.isSending.set(true);
      this.saveFeedback.set('Guardando cambios...');

      this.tasksService
        .updateScheduledTaskById(originalTask.id, updatePayload)
        .pipe(finalize(() => this.isSending.set(false)))
        .subscribe({
          next: () => {
            this.saveFeedback.set('Tarea editada correctamente.');
            this.showTaskUpdatedNotification();
            this.resetSchedulerFormAfterSuccess();
            this.loadScheduledTasks();
          },
          error: (error: unknown) => {
            this.saveFeedback.set(this.resolveScheduleRequestErrorMessage(error, true));
          },
        });

      return;
    }

    this.isSending.set(true);
    this.saveFeedback.set('Enviando mensaje...');

    this.tasksService
      .sendMessage(payload)
      .pipe(finalize(() => this.isSending.set(false)))
      .subscribe({
        next: () => {
          this.saveFeedback.set('Mensaje enviado correctamente.');
          this.showTaskCreatedNotification();
          this.resetSchedulerFormAfterSuccess();
          this.loadScheduledTasks();
        },
        error: (error: unknown) => {
          this.saveFeedback.set(this.resolveScheduleRequestErrorMessage(error, false));
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
    this.syncUserScope();

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
      sendWindow: task.sendWindow,
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

  protected isTaskEditLoading(task: ScheduledTaskCard): boolean {
    return this.loadingEditTaskId() === task.id;
  }

  protected editScheduledTask(task: ScheduledTaskCard): void {
    this.loadingEditTaskId.set(task.id);
    this.saveFeedback.set('Cargando datos de la tarea...');

    this.tasksService
      .getScheduledTaskById(task.id)
      .pipe(finalize(() => this.loadingEditTaskId.set('')))
      .subscribe({
        next: (response) => {
          const normalizedTask = this.tasksService.normalizeScheduledTask(response);
          const taskForEdit = this.toCardModel(normalizedTask);
          this.prefillTaskForm(taskForEdit);
          this.saveFeedback.set(`Editando tarea ${taskForEdit.jobName || taskForEdit.id}.`);
        },
        error: () => {
          this.saveFeedback.set('No se pudo cargar la tarea para editar.');
        },
      });
  }

  protected cancelEditingTask(): void {
    this.resetSchedulerFormAfterSuccess();
    this.saveFeedback.set('Edicion cancelada.');
  }

  private loadMyGroups(): void {
    this.syncUserScope();

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

  private syncUserScope(forceReset = false): void {
    const nextScope = this.tokenService.getUserScopeKey();
    const previousScope = this.activeUserScope();
    if (!forceReset && nextScope === previousScope) {
      return;
    }

    this.activeUserScope.set(nextScope);
    this.scheduledTasks.set([]);
    this.availableGroups.set([]);
    this.hasLoadedGroups.set(false);
    this.groupsLoadError.set('');
    this.scheduledLoadError.set('');
    this.actionTaskId.set('');
    this.loadingEditTaskId.set('');
    this.resetSchedulerFormAfterSuccess();
    this.saveFeedback.set('');
  }

  private resetPrivateRecipientSelection(): void {
    while (this.recipientsArray.length > 0) {
      this.recipientsArray.removeAt(0);
    }

    this.schedulerForm.controls.recipientLada.setValue(DEFAULT_LADA);
    this.schedulerForm.controls.recipientName.setValue('');
    this.schedulerForm.controls.recipientPhone.setValue('');
    this.schedulerForm.controls.recipientLada.markAsUntouched();
    this.schedulerForm.controls.recipientName.markAsUntouched();
    this.schedulerForm.controls.recipientPhone.markAsUntouched();
  }

  private resetGroupSelection(): void {
    this.isGroupModalOpen.set(false);
    this.schedulerForm.controls.groupId.setValue('');
  }

  private buildSendWindow(shouldRepeat: boolean): { start: string; end: string; start_at?: string } | null | undefined {
    const useSendWindow = this.schedulerForm.controls.useSendWindow.value;
    if (!shouldRepeat) {
      return undefined;
    }

    const startAt = this.schedulerForm.controls.sendWindowStartAt.value.trim();

    if (!useSendWindow) {
      if (startAt.length === 0) {
        return undefined;
      }

      if (!TIME_24H_FORMAT.test(startAt)) {
        this.schedulerForm.controls.sendWindowStartAt.markAsTouched();
        return null;
      }

      return {
        start: FULL_DAY_WINDOW_START,
        end: FULL_DAY_WINDOW_END,
        start_at: startAt,
      };
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

    if (startAt.length > 0 && !this.isSendWindowStartAtValid()) {
      this.schedulerForm.controls.sendWindowStartAt.markAsTouched();
      return null;
    }

    return {
      start,
      end,
      ...(startAt.length > 0 ? { start_at: startAt } : {}),
    };
  }

  private isSendWindowValidForSubmit(shouldRepeat: boolean): boolean {
    const useSendWindow = this.schedulerForm.controls.useSendWindow.value;
    if (!shouldRepeat) {
      return true;
    }

    const startAt = this.schedulerForm.controls.sendWindowStartAt.value.trim();
    if (!useSendWindow) {
      return startAt.length === 0 || TIME_24H_FORMAT.test(startAt);
    }

    const start = this.schedulerForm.controls.sendWindowStart.value.trim();
    const end = this.schedulerForm.controls.sendWindowEnd.value.trim();

    if (!TIME_24H_FORMAT.test(start) || !TIME_24H_FORMAT.test(end)) {
      return false;
    }

    if (!this.isStartTimeBeforeEndTime(start, end)) {
      return false;
    }

    return this.isSendWindowStartAtValid();
  }

  private isSendWindowStartAtValid(): boolean {
    const { sendWindowStart, sendWindowEnd, sendWindowStartAt } = this.schedulerForm.controls;

    const start = sendWindowStart.value.trim();
    const end = sendWindowEnd.value.trim();
    const startAt = sendWindowStartAt.value.trim();

    if (startAt.length === 0) {
      return true;
    }

    if (!TIME_24H_FORMAT.test(startAt) || !TIME_24H_FORMAT.test(start) || !TIME_24H_FORMAT.test(end)) {
      return false;
    }

    const startMinutes = this.toMinutes(start);
    const endMinutes = this.toMinutes(end);
    const startAtMinutes = this.toMinutes(startAt);

    return this.isTimeWithinWindow(startAtMinutes, startMinutes, endMinutes);
  }

  private isStartTimeBeforeEndTime(start: string, end: string): boolean {
    return this.toMinutes(start) !== this.toMinutes(end);
  }

  private isTimeWithinWindow(targetMinutes: number, startMinutes: number, endMinutes: number): boolean {
    if (startMinutes < endMinutes) {
      return targetMinutes >= startMinutes && targetMinutes <= endMinutes;
    }

    return targetMinutes >= startMinutes || targetMinutes <= endMinutes;
  }

  private toMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map((value) => Number.parseInt(value, 10));
    return hours * 60 + minutes;
  }

  private toWhatsappJid(rawPhone: string): string {
    const trimmed = rawPhone.trim();
    if (trimmed.includes('@')) {
      return trimmed;
    }

    const digitsOnly = trimmed.replace(/\D/g, '');
    return `${digitsOnly}@s.whatsapp.net`;
  }

  private toEditableRecipientPhone(phone: string): string {
    const withoutDomain = phone.includes('@') ? phone.split('@')[0] : phone;
    return withoutDomain.replace(/\D/g, '');
  }

  private isGroupRecipientPhone(phone: string): boolean {
    return phone.includes('@g.us');
  }

  private prefillTaskForm(task: ScheduledTaskCard): void {
    this.editingTaskId.set(task.id);
    this.editingOriginalTask.set(task);

    const isGroupRecipient = task.recipients.some((recipient) => this.isGroupRecipientPhone(recipient.phone));
    const shouldRepeat = task.frequency > 0;
    const frequencyOption: FrequencyOption =
      task.frequency === 15 || task.frequency === 30 || task.frequency === 60 ? (task.frequency as 15 | 30 | 60) : 'custom';

    this.schedulerForm.controls.message.setValue(task.message ?? '');
    this.schedulerForm.controls.repeat.setValue(shouldRepeat);
    this.schedulerForm.controls.frequency.setValue(task.frequency);
    this.schedulerForm.controls.frequencyOption.setValue(shouldRepeat ? frequencyOption : 15);
    const isFullDayWindow = task.sendWindow?.start === FULL_DAY_WINDOW_START && task.sendWindow?.end === FULL_DAY_WINDOW_END;
    const hasCustomWindow = !!task.sendWindow && !isFullDayWindow;

    this.schedulerForm.controls.useSendWindow.setValue(hasCustomWindow);
    this.schedulerForm.controls.sendWindowStart.setValue(hasCustomWindow ? (task.sendWindow?.start ?? '08:00') : '08:00');
    this.schedulerForm.controls.sendWindowEnd.setValue(hasCustomWindow ? (task.sendWindow?.end ?? '18:00') : '18:00');
    this.schedulerForm.controls.sendWindowStartAt.setValue(task.sendWindow?.start_at ?? '');

    this.resetPrivateRecipientSelection();
    this.resetGroupSelection();

    if (isGroupRecipient) {
      const primaryGroup = task.recipients[0];
      this.schedulerForm.controls.recipientType.setValue('group');
      this.schedulerForm.controls.groupId.setValue(primaryGroup?.phone?.trim() ?? '');
      this.loadMyGroups();
    } else {
      this.schedulerForm.controls.recipientType.setValue('private');
      for (const recipient of task.recipients) {
        const editablePhone = this.toEditableRecipientPhone(recipient.phone);
        if (!editablePhone) {
          continue;
        }

        this.recipientsArray.push(
          this.formBuilder.nonNullable.group({
            name: [recipient.name.trim(), [Validators.required, Validators.minLength(2)]],
            phone: [editablePhone, [Validators.required, Validators.pattern(/^\d{11,15}$/)]],
          }),
        );
      }
    }

    this.lastRepeatFrequency.set(shouldRepeat ? task.frequency : 15);
    this.schedulerForm.markAsPristine();
    this.schedulerForm.markAsUntouched();
  }

  private buildUpdatePayload(
    originalTask: ScheduledTaskCard,
    message: string,
    frequency: number,
    recipients: Array<{ name: string; phone: string }>,
    sendWindow: SendWindowPayload | undefined,
  ): ScheduledTaskUpdatePayload {
    const payload: ScheduledTaskUpdatePayload = {};

    if (message !== originalTask.message) {
      payload.message = message;
    }

    if (frequency > 0 && frequency !== originalTask.frequency) {
      payload.frequency = frequency;
    }

    if (!this.areRecipientsEqual(recipients, originalTask.recipients)) {
      payload.recipients = recipients;
    }

    if (!this.areSendWindowsEqual(sendWindow, originalTask.sendWindow)) {
      if (sendWindow) {
        payload.send_window = sendWindow;
      }
    }

    return payload;
  }

  private hasPendingEditChanges(): boolean {
    const originalTask = this.editingOriginalTask();
    if (!originalTask) {
      return false;
    }

    const shouldRepeat = this.schedulerForm.controls.repeat.value;
    const frequency = shouldRepeat ? this.schedulerForm.controls.frequency.value : 0;
    const sendWindow = this.buildSendWindowPayload(shouldRepeat);
    const recipients = this.buildRecipientsPayload(this.schedulerForm.controls.recipientType.value);
    const message = this.schedulerForm.controls.message.value.trim();

    const payload = this.buildUpdatePayload(originalTask, message, frequency, recipients, sendWindow);
    return Object.keys(payload).length > 0;
  }

  private buildSendWindowPayload(shouldRepeat: boolean): SendWindowPayload | undefined {
    const useSendWindow = this.schedulerForm.controls.useSendWindow.value;
    if (!shouldRepeat) {
      return undefined;
    }

    const startAt = this.schedulerForm.controls.sendWindowStartAt.value.trim();

    if (!useSendWindow) {
      if (!startAt) {
        return undefined;
      }

      return {
        start: FULL_DAY_WINDOW_START,
        end: FULL_DAY_WINDOW_END,
        start_at: startAt,
      };
    }

    const start = this.schedulerForm.controls.sendWindowStart.value.trim();
    const end = this.schedulerForm.controls.sendWindowEnd.value.trim();

    return {
      start,
      end,
      ...(startAt ? { start_at: startAt } : {}),
    };
  }

  private buildRecipientsPayload(recipientType: RecipientType): Array<{ name: string; phone: string }> {
    if (recipientType === 'group') {
      const selectedGroup = this.selectedGroup();
      const fallbackName = this.editingOriginalTask()?.recipients[0]?.name?.trim() || 'Grupo';
      return [
        {
          name: selectedGroup?.Name?.trim() || fallbackName,
          phone: this.schedulerForm.controls.groupId.value.trim(),
        },
      ];
    }

    return this.recipientsArray.getRawValue().map((recipient: Recipient) => ({
      name: recipient.name.trim(),
      phone: this.toWhatsappJid(recipient.phone),
    }));
  }

  private areSendWindowsEqual(current: SendWindowPayload | undefined, original: SendWindowPayload | undefined): boolean {
    const normalize = (value: SendWindowPayload | undefined): string => {
      if (!value) {
        return '';
      }

      return JSON.stringify({
        start: value.start,
        end: value.end,
        start_at: value.start_at || '',
      });
    };

    return normalize(current) === normalize(original);
  }

  private areRecipientsEqual(
    current: Array<{ name: string; phone: string }>,
    original: Array<{ name: string; phone: string }>,
  ): boolean {
    if (current.length !== original.length) {
      return false;
    }

    return current.every((recipient, index) => {
      const originalRecipient = original[index];
      if (!originalRecipient) {
        return false;
      }

      return recipient.name.trim() === originalRecipient.name.trim() && recipient.phone.trim() === originalRecipient.phone.trim();
    });
  }

  private buildRecipientPhone(lada: string, phone: string): string {
    const ladaDigits = lada.replace(/\D/g, '');
    const phoneDigits = phone.replace(/\D/g, '');

    if (ladaDigits === '52') {
      return `521${phoneDigits}`;
    }

    return `${ladaDigits}${phoneDigits}`;
  }

  private checkDeviceStatus(): void {
    this.isDeviceLinked.set(null);

    this.settingsService
      .getDeviceStatus()
      .pipe(finalize(() => {}))
      .subscribe({
        next: (isLinked) => {
          this.isDeviceLinked.set(isLinked);
          if (!isLinked) {
            this.showDeviceWarningModal.set(true);
          }
        },
        error: () => {
          this.isDeviceLinked.set(false);
          this.showDeviceWarningModal.set(true);
        },
      });
  }

  protected navigateToSettings(): void {
    this.showDeviceWarningModal.set(false);
    this.router.navigate(['/settings']);
  }

  protected retryDeviceCheck(): void {
    this.showDeviceWarningModal.set(false);
    this.checkDeviceStatus();
  }

  private showTaskCreatedNotification(): void {
    this.snackBar.open('Tarea creada con exito.', 'Cerrar', {
      duration: 3200,
      horizontalPosition: 'right',
      verticalPosition: 'top',
    });
  }

  private showTaskUpdatedNotification(): void {
    this.snackBar.open('Tarea editada con exito.', 'Cerrar', {
      duration: 3200,
      horizontalPosition: 'right',
      verticalPosition: 'top',
    });
  }

  private resetSchedulerFormAfterSuccess(): void {
    this.schedulerForm.controls.message.setValue('');
    this.schedulerForm.controls.repeat.setValue(false);
    this.schedulerForm.controls.frequency.setValue(0);
    this.schedulerForm.controls.frequencyOption.setValue(15);
    this.schedulerForm.controls.useSendWindow.setValue(false);
    this.schedulerForm.controls.sendWindowStart.setValue('08:00');
    this.schedulerForm.controls.sendWindowEnd.setValue('18:00');
    this.schedulerForm.controls.sendWindowStartAt.setValue('');
    this.schedulerForm.controls.recipientType.setValue('private');

    this.resetPrivateRecipientSelection();
    this.resetGroupSelection();

    this.groupSearchTerm.set('');
    this.lastRepeatFrequency.set(15);
    this.editingTaskId.set('');
    this.editingOriginalTask.set(null);

    this.schedulerForm.markAsPristine();
    this.schedulerForm.markAsUntouched();
  }

  private resolveScheduleRequestErrorMessage(error: unknown, isEditRequest: boolean): string {
    const defaultMessage = isEditRequest
      ? 'No se pudo editar la tarea programada.'
      : 'No se pudo enviar el mensaje. Verifica el servicio en localhost:3000.';

    if (!(error instanceof HttpErrorResponse)) {
      return defaultMessage;
    }

    const serverMessage = this.extractServerMessage(error.error).toLocaleLowerCase();
    const invalidStartAtInWindow =
      error.status === 400 &&
      (serverMessage.includes('start_at') || serverMessage.includes('start at')) &&
      (serverMessage.includes('window') || serverMessage.includes('ventana') || serverMessage.includes('start') || serverMessage.includes('end'));

    if (invalidStartAtInWindow) {
      return 'El primer envio debe estar dentro del horario configurado en la ventana de envio.';
    }

    return defaultMessage;
  }

  private extractServerMessage(payload: unknown): string {
    if (!payload) {
      return '';
    }

    if (typeof payload === 'string') {
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload.filter((item): item is string => typeof item === 'string').join(' ');
    }

    if (typeof payload !== 'object') {
      return '';
    }

    const record = payload as Record<string, unknown>;
    const candidates = ['message', 'error', 'detail', 'details'];
    for (const key of candidates) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
      if (Array.isArray(value)) {
        const joined = value.filter((item): item is string => typeof item === 'string').join(' ').trim();
        if (joined.length > 0) {
          return joined;
        }
      }
    }

    return '';
  }
}
