import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface SmsMessage {
  to: string;
  text: string;
}

/** Email over SMTP (nodemailer). */
@Injectable()
export class MailService {
  private readonly transporter: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.transporter = createTransport({ host: config.mail.host, port: config.mail.port, secure: false });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.config.mail.from, ...message });
  }
}

/**
 * SMS through a provider's REST API (FR-36). The provider is still undecided (SRS 9.7),
 * so the only driver for now logs the message.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger('SMS');

  async send(message: SmsMessage): Promise<void> {
    this.logger.log(`[log driver] to ${message.to}: ${message.text}`);
  }
}
