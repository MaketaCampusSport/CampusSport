import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import { Page, pageOf, pageOffset } from '../../common/http/pagination';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { User } from '../../database/entities';
import type { Role } from '../../database/enums';
import { AuditService } from '../audit/audit.service';
import { ListUsersQueryDto, toUserResponse, UserResponse } from './dto/user.dto';

export interface SsoIdentity {
  subject: string;
  email: string;
  fullName: string;
  role: Exclude<Role, 'external'>;
}

export interface NewExternal {
  fullName: string;
  email: string;
  phone: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  toResponse(user: User): UserResponse {
    return toUserResponse(user, this.config.facilityTimezone);
  }

  async getById(id: string): Promise<User> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new AppException('NOT_FOUND');
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: normalizeEmail(email) });
  }

  async getTotpSecret(userId: string): Promise<string | null> {
    const row = await this.users
      .createQueryBuilder('u')
      .select('u.id')
      .addSelect('u.totpSecret')
      .where('u.id = :userId', { userId })
      .getOne();
    return row?.totpSecret ?? null;
  }

  async setTotpSecret(userId: string, secret: string): Promise<void> {
    await this.users.update({ id: userId }, { totpSecret: secret });
  }

  /**
   * Creates or updates a member after SSO (FR-01). The IdP is authoritative for name and role.
   * A user with the same email and no SSO subject yet (e.g. seeded) is linked to this subject.
   */
  async upsertFromSso(identity: SsoIdentity): Promise<User> {
    const email = normalizeEmail(identity.email);
    let user = await this.users.findOneBy({ ssoSubject: identity.subject });
    if (!user) {
      const byEmail = await this.users.findOneBy({ email });
      if (byEmail?.role === 'external') throw new AppException('EMAIL_ALREADY_USED');
      user = byEmail;
    }
    if (user) {
      await this.users.update(
        { id: user.id },
        { ssoSubject: identity.subject, email, fullName: identity.fullName, role: identity.role, lastActiveAt: new Date() },
      );
      return this.getById(user.id);
    }
    const created = await this.users.save(
      this.users.create({
        ssoSubject: identity.subject,
        email,
        fullName: identity.fullName,
        role: identity.role,
        lastActiveAt: new Date(),
      }),
    );
    return this.getById(created.id);
  }

  /** New or re-started external registration (FR-02). Verified accounts and members keep their email. */
  async createOrResetExternal(input: NewExternal): Promise<User> {
    const email = normalizeEmail(input.email);
    const existing = await this.users.findOneBy({ email });
    if (existing && (existing.role !== 'external' || existing.emailVerifiedAt)) {
      throw new AppException('EMAIL_ALREADY_USED');
    }
    if (existing) {
      await this.users.update({ id: existing.id }, { fullName: input.fullName, phone: input.phone });
      return this.getById(existing.id);
    }
    const created = await this.users.save(
      this.users.create({ fullName: input.fullName, email, phone: input.phone, role: 'external', ssoSubject: null }),
    );
    return this.getById(created.id);
  }

  async markExternalVerified(userId: string, phoneToo: boolean): Promise<void> {
    const now = new Date();
    await this.users.update(
      { id: userId },
      phoneToo
        ? { emailVerifiedAt: now, phoneVerifiedAt: now, lastActiveAt: now }
        : { emailVerifiedAt: now, lastActiveAt: now },
    );
  }

  async touch(userId: string): Promise<void> {
    await this.users.update({ id: userId }, { lastActiveAt: new Date() });
  }

  async list(query: ListUsersQueryDto): Promise<Page<UserResponse>> {
    const base: FindOptionsWhere<User> = {};
    if (query.role) base.role = query.role;
    if (query.status) base.status = query.status;
    const term = query.q?.trim();
    const where = term
      ? [
          { ...base, fullName: ILike(`%${escapeLike(term)}%`) },
          { ...base, email: ILike(`%${escapeLike(term)}%`) },
        ]
      : base;
    const [rows, total] = await this.users.findAndCount({ where, order: { fullName: 'ASC' }, ...pageOffset(query) });
    return pageOf(
      query,
      rows.map((u) => this.toResponse(u)),
      total,
    );
  }

  async suspend(actor: AuthUser, id: string, until: Date, reason: string): Promise<UserResponse> {
    if (until.getTime() <= Date.now()) {
      throw new AppException('VALIDATION_FAILED', { details: { fields: { until: ['must be in the future'] } } });
    }
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(User);
      const user = await repo.findOneBy({ id });
      if (!user) throw new AppException('NOT_FOUND');
      const before = { status: user.status, suspended_until: user.suspendedUntil };
      await repo.update({ id }, { status: 'suspended', suspendedUntil: until });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.suspend',
          entity: 'user',
          entityId: id,
          before,
          after: { status: 'suspended', suspended_until: until.toISOString(), reason },
        },
        em,
      );
      return this.toResponse((await repo.findOneBy({ id }))!);
    });
  }

  async reactivate(actor: AuthUser, id: string): Promise<UserResponse> {
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(User);
      const user = await repo.findOneBy({ id });
      if (!user) throw new AppException('NOT_FOUND');
      await repo.update({ id }, { status: 'active', suspendedUntil: null });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.reactivate',
          entity: 'user',
          entityId: id,
          before: { status: user.status, suspended_until: user.suspendedUntil },
          after: { status: 'active', suspended_until: null },
        },
        em,
      );
      return this.toResponse((await repo.findOneBy({ id }))!);
    });
  }

  /**
   * NFR-11 / SDD 5.3: cancels future bookings, keeps the history anonymized, deletes the account.
   * Administrators cannot delete themselves here: their audit entries reference the account.
   * Returns the cancelled bookings so the caller can free the slots.
   */
  async deleteSelf(user: AuthUser): Promise<{ cancelledBookingIds: string[] }> {
    if (user.role === 'admin') throw new AppException('FORBIDDEN');
    return this.dataSource.transaction(async (em) => {
      const cancelled: { id: string }[] = await em.query(
        `UPDATE occupancy SET status = 'cancelled', cancel_source = 'user'
         WHERE user_id = $1 AND kind = 'booking' AND status = 'active' AND lower(period) > now()
         RETURNING id`,
        [user.id],
      );
      await em.query(`UPDATE occupancy SET user_id = NULL, anonymized_at = now() WHERE user_id = $1`, [user.id]);
      await em.query(`DELETE FROM users WHERE id = $1`, [user.id]);
      await this.audit.record(
        { actorId: null, action: 'user.delete', entity: 'user', entityId: user.id, after: { self_service: true } },
        em,
      );
      return { cancelledBookingIds: cancelled.map((r) => r.id) };
    });
  }
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}
