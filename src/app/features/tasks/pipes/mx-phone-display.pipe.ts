import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'mxPhoneDisplay',
})
export class MxPhoneDisplayPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const digitsOnly = value.replace(/\D/g, '');
    if (!digitsOnly) {
      return value;
    }

    // Removes WhatsApp suffix if phone comes as JID (e.g. 521...@s.whatsapp.net)
    const normalized = digitsOnly;

    if (normalized.startsWith('521') && normalized.length >= 13) {
      const local = normalized.slice(3, 13);
      return `+52 1 ${this.formatLocal10(local)}`;
    }

    if (normalized.startsWith('52') && normalized.length >= 12) {
      const local = normalized.slice(2, 12);
      return `+52 ${this.formatLocal10(local)}`;
    }

    return `+${normalized}`;
  }

  private formatLocal10(local: string): string {
    const trimmed = local.slice(0, 10);
    const partA = trimmed.slice(0, 3);
    const partB = trimmed.slice(3, 6);
    const partC = trimmed.slice(6, 10);

    if (partC.length === 0) {
      return trimmed;
    }

    return `${partA}-${partB}-${partC}`;
  }
}
