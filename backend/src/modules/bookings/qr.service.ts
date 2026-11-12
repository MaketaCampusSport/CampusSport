import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';

export interface QrPayload {
  bookingId: string;
  nonce: string;
  /** Day of the booking (`YYYY-MM-DD`, facility zone): the code is valid only that day. */
  day: string;
}

/**
 * QR content `<occupancy_id>.<qr_nonce>.<signature>`, signed with HMAC-SHA256 over id, nonce and day
 * (FR-03, NFR-09). The nonce lives in `occupancy.qr_nonce`, so a stolen screenshot is useless after a reissue.
 */
@Injectable()
export class QrService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private signature(p: QrPayload): string {
    return createHmac('sha256', this.config.qrHmacSecret)
      .update(`${p.bookingId}.${p.nonce}.${p.day}`)
      .digest('base64url');
  }

  sign(p: QrPayload): string {
    return `${p.bookingId}.${p.nonce}.${this.signature(p)}`;
  }

  /** Checks the signature for the expected day; returns booking id and nonce, or null. */
  verify(token: string, day: string): { bookingId: string; nonce: string } | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [bookingId, nonce, sig] = parts;
    const expected = Buffer.from(this.signature({ bookingId, nonce, day }));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return { bookingId, nonce };
  }
}
