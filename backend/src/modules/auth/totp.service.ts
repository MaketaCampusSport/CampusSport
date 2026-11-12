import { Inject, Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';

/** TOTP (RFC 6238) for the administrators' second step (NFR-08). */
@Injectable()
export class TotpService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  generateSecret(): string {
    return generateSecret();
  }

  otpauthUri(email: string, secret: string): string {
    return generateURI({ issuer: this.config.totpIssuer, label: email, secret });
  }

  /** Accepts the previous and next 30-second step to absorb clock drift. */
  verify(secret: string, code: string): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    try {
      return verifySync({ secret, token: code, epochTolerance: 30 }).valid;
    } catch {
      return false;
    }
  }
}
