import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { KV_STORE } from '../../common/kv/kv-store';
import type { KvStore } from '../../common/kv/kv-store';

export const OTP_TTL_SECONDS = 600;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpChannel = 'email' | 'phone';

function hash(subject: string, code: string): string {
  return createHash('sha256').update(`${subject}:${code}`).digest('base64url');
}

/** 6-digit one-time codes for externals (FR-02), hashed in Redis, valid 10 minutes, 5 attempts. */
@Injectable()
export class OtpService {
  constructor(@Inject(KV_STORE) private readonly kv: KvStore) {}

  async issue(channel: OtpChannel, subject: string): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.kv.set(`otp:${channel}:${subject}`, hash(subject, code), OTP_TTL_SECONDS);
    await this.kv.del(`otp-attempts:${channel}:${subject}`);
    return code;
  }

  /** Each wrong guess counts; after the limit the code is discarded and a new one must be requested. */
  async verify(channel: OtpChannel, subject: string, code: string | undefined): Promise<boolean> {
    if (!code || !/^\d{6}$/.test(code)) return false;
    const key = `otp:${channel}:${subject}`;
    const stored = await this.kv.get<string>(key);
    if (!stored) return false;
    const attempts = await this.kv.incr(`otp-attempts:${channel}:${subject}`, OTP_TTL_SECONDS);
    if (attempts > OTP_MAX_ATTEMPTS) {
      await this.kv.del(key);
      return false;
    }
    const a = Buffer.from(stored);
    const b = Buffer.from(hash(subject, code));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async consume(channel: OtpChannel, subject: string): Promise<void> {
    await this.kv.del(`otp:${channel}:${subject}`, `otp-attempts:${channel}:${subject}`);
  }
}
