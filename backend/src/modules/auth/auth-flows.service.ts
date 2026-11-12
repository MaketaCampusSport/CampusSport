import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { KV_STORE } from '../../common/kv/kv-store';
import type { KvStore } from '../../common/kv/kv-store';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import type { User } from '../../database/entities';
import { MailService, SmsService } from '../messaging/messaging.service';
import {
  ExternalLoginDto,
  ExternalRegistrationDto,
  ExternalVerifyDto,
  OtpSentResponse,
} from './dto/auth.dto';
import { mapRole, OidcService } from './oidc.service';
import { OTP_TTL_SECONDS, OtpService } from './otp.service';
import { TotpService } from './totp.service';
import { normalizeEmail, UsersService } from './users.service';

const LOGIN_STATE_TTL = 600;
const CHALLENGE_TTL = 300;
const CHALLENGE_MAX_ATTEMPTS = 5;

interface LoginState {
  codeVerifier: string;
  returnTo: string;
}

interface TwoFactorChallenge {
  userId: string;
  returnTo: string;
}

export type SsoCallbackResult =
  { kind: 'member'; user: User; redirectTo: string } | { kind: 'second-factor'; redirectTo: string };

/** Only same-origin paths of the PWA are accepted, to avoid open redirects. */
export function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/start';
  return value;
}

/** Login flows: SSO for members, TOTP for admins, OTP for externals (FR-01, FR-02, NFR-08). */
@Injectable()
export class AuthFlowsService {
  private readonly logger = new Logger(AuthFlowsService.name);

  constructor(
    private readonly oidc: OidcService,
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly totp: TotpService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    @Inject(KV_STORE) private readonly kv: KvStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private pwa(path: string, params: Record<string, string> = {}): string {
    const url = new URL(path, this.config.pwaUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.href;
  }

  async startSso(returnTo: string | undefined): Promise<string> {
    const request = await this.oidc.authorizationRequest();
    const state: LoginState = { codeVerifier: request.codeVerifier, returnTo: safeReturnTo(returnTo) };
    await this.kv.set(`oidc-state:${request.state}`, state, LOGIN_STATE_TTL);
    return request.url;
  }

  async finishSso(query: Record<string, string>): Promise<SsoCallbackResult> {
    const state = await this.kv.take<LoginState>(`oidc-state:${query.state}`);
    if (!state) throw new AppException('BAD_REQUEST');
    const claims = await this.oidc.exchange(new URLSearchParams(query).toString(), {
      state: query.state,
      codeVerifier: state.codeVerifier,
    });
    const role = mapRole(claims.roleValues, this.config.oidc.roleMap);
    if (!role) throw new AppException('FORBIDDEN');
    const user = await this.users.upsertFromSso({
      subject: claims.subject,
      email: claims.email,
      fullName: claims.fullName,
      role,
    });

    if (user.role !== 'admin') return { kind: 'member', user, redirectTo: this.pwa(state.returnTo) };

    if (!(await this.users.getTotpSecret(user.id))) {
      return { kind: 'second-factor', redirectTo: this.pwa('/auth/2fa', { error: 'totp_not_enrolled' }) };
    }
    const challengeId = randomUUID();
    await this.kv.set<TwoFactorChallenge>(
      `2fa:${challengeId}`,
      { userId: user.id, returnTo: state.returnTo },
      CHALLENGE_TTL,
    );
    return {
      kind: 'second-factor',
      redirectTo: this.pwa('/auth/2fa', { challenge_id: challengeId, return_to: state.returnTo }),
    };
  }

  async verifySecondFactor(challengeId: string, code: string): Promise<User> {
    const challenge = await this.kv.get<TwoFactorChallenge>(`2fa:${challengeId}`);
    if (!challenge) throw new AppException('OTP_INVALID');
    const secret = await this.users.getTotpSecret(challenge.userId);
    if (secret && this.totp.verify(secret, code)) {
      await this.kv.del(`2fa:${challengeId}`, `2fa-attempts:${challengeId}`);
      return this.users.getById(challenge.userId);
    }
    if ((await this.kv.incr(`2fa-attempts:${challengeId}`, CHALLENGE_TTL)) >= CHALLENGE_MAX_ATTEMPTS) {
      await this.kv.del(`2fa:${challengeId}`);
    }
    throw new AppException('OTP_INVALID');
  }

  async registerExternal(dto: ExternalRegistrationDto): Promise<OtpSentResponse> {
    const user = await this.users.createOrResetExternal({
      fullName: dto.full_name,
      email: dto.email,
      phone: dto.phone,
    });
    await this.sendCodes(user, true);
    return { expires_in: OTP_TTL_SECONDS };
  }

  /** Same answer whether or not the account exists, so registered emails are not disclosed. */
  async requestExternalLogin(dto: ExternalLoginDto): Promise<OtpSentResponse> {
    const user = await this.users.findByEmail(dto.email);
    if (user?.role === 'external' && user.emailVerifiedAt) await this.sendCodes(user, false);
    return { expires_in: OTP_TTL_SECONDS };
  }

  async verifyExternal(dto: ExternalVerifyDto): Promise<User> {
    const email = normalizeEmail(dto.email);
    const user = await this.users.findByEmail(email);
    if (!user || user.role !== 'external') throw new AppException('OTP_INVALID');
    const firstVerification = !user.emailVerifiedAt;
    const emailOk = await this.otp.verify('email', email, dto.email_code);
    const phoneOk = firstVerification ? await this.otp.verify('phone', email, dto.phone_code) : true;
    if (!emailOk || !phoneOk) throw new AppException('OTP_INVALID');
    await this.otp.consume('email', email);
    if (firstVerification) await this.otp.consume('phone', email);
    await this.users.markExternalVerified(user.id, firstVerification);
    return this.users.getById(user.id);
  }

  private async sendCodes(user: User, includePhone: boolean): Promise<void> {
    const emailCode = await this.otp.issue('email', user.email);
    const minutes = OTP_TTL_SECONDS / 60;
    await this.mail
      .send({
        to: user.email,
        subject: `CampusSport: codul tău este ${emailCode}`,
        text: `Codul tău CampusSport este ${emailCode}. Este valabil ${minutes} minute.\n\nYour CampusSport code is ${emailCode}. It is valid for ${minutes} minutes.`,
      })
      .catch((err) => this.logger.error(`OTP email for user ${user.id} failed: ${err.message}`));
    if (includePhone && user.phone) {
      const phoneCode = await this.otp.issue('phone', user.email);
      await this.sms.send({ to: user.phone, text: `CampusSport: codul tău este ${phoneCode}.` });
    }
  }
}
