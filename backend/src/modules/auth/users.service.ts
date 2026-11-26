import { Inject, Injectable } from '@nestjs/common';
import { rowsOf } from '../../common/db/rows';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import type { EntityManager, FindOptionsWhere } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { pgErrorCode } from '../../common/errors/all-exceptions.filter';
import { AppException } from '../../common/errors/app.exception';
import { Page, pageOf, pageOffset } from '../../common/http/pagination';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { User } from '../../database/entities';
// DISABLED with SSO: import type { Role } from '../../database/enums';
import { AuditService } from '../audit/audit.service';
import type { CancelledBooking } from '../jobs/queues';
import {
  CreateUserDto,
  ListUsersQueryDto,
  toUserResponse,
  UpdateUserDto,
  UserResponse,
} from './dto/user.dto';
import { hashPassword } from './password';

// DISABLED: SSO and the external OTP flow are commented out; sign-in is email + password.
// export interface SsoIdentity {
//   subject: string;
//   email: string;
//   fullName: string;
//   role: Exclude<Role, 'external'>;
// }
//
// export interface NewExternal {
//   fullName: string;
//   email: string;
//   phone: string;
// }

export interface NewPasswordUser {
  fullName: string;
  email: string;
  password: string;
  role: 'student' | 'teacher';
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

  /** Active accounts, for the development-only login picker. */
  listActive(limit = 50): Promise<User[]> {
    return this.users.find({
      where: { status: 'active' },
      order: { role: 'ASC', fullName: 'ASC' },
      take: limit,
    });
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

  async getPasswordHash(userId: string): Promise<string | null> {
    const row = await this.users
      .createQueryBuilder('u')
      .select('u.id')
      .addSelect('u.passwordHash')
      .where('u.id = :userId', { userId })
      .getOne();
    return row?.passwordHash ?? null;
  }

  /** Self-service registration with email + password; only `student` and `teacher` can be chosen (FR-01). */
  async createWithPassword(input: NewPasswordUser): Promise<User> {
    const email = normalizeEmail(input.email);
    if (await this.users.existsBy({ email })) throw new AppException('EMAIL_ALREADY_USED');
    try {
      const created = await this.users.save(
        this.users.create({
          fullName: input.fullName.trim(),
          email,
          role: input.role,
          ssoSubject: null,
          passwordHash: await hashPassword(input.password),
          lastActiveAt: new Date(),
        }),
      );
      return this.getById(created.id);
    } catch (err) {
      // Two registrations with the same email at once: users_email_uq decides.
      if ((err as { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new AppException('EMAIL_ALREADY_USED');
      }
      throw err;
    }
  }

  // DISABLED: SSO and the external OTP flow are commented out; sign-in is email + password.
  // /**
  //  * Creates or updates a member after SSO (FR-01). The IdP is authoritative for name and role.
  //  * A user with the same email and no SSO subject yet (e.g. seeded) is linked to this subject.
  //  */
  // async upsertFromSso(identity: SsoIdentity): Promise<User> {
  //   const email = normalizeEmail(identity.email);
  //   let user = await this.users.findOneBy({ ssoSubject: identity.subject });
  //   if (!user) {
  //     const byEmail = await this.users.findOneBy({ email });
  //     if (byEmail?.role === 'external') throw new AppException('EMAIL_ALREADY_USED');
  //     user = byEmail;
  //   }
  //   if (user) {
  //     await this.users.update(
  //       { id: user.id },
  //       {
  //         ssoSubject: identity.subject,
  //         email,
  //         fullName: identity.fullName,
  //         role: identity.role,
  //         lastActiveAt: new Date(),
  //       },
  //     );
  //     return this.getById(user.id);
  //   }
  //   const created = await this.users.save(
  //     this.users.create({
  //       ssoSubject: identity.subject,
  //       email,
  //       fullName: identity.fullName,
  //       role: identity.role,
  //       lastActiveAt: new Date(),
  //     }),
  //   );
  //   return this.getById(created.id);
  // }
  //
  // /** New or re-started external registration (FR-02). Verified accounts and members keep their email. */
  // async createOrResetExternal(input: NewExternal): Promise<User> {
  //   const email = normalizeEmail(input.email);
  //   const existing = await this.users.findOneBy({ email });
  //   if (existing && (existing.role !== 'external' || existing.emailVerifiedAt)) {
  //     throw new AppException('EMAIL_ALREADY_USED');
  //   }
  //   if (existing) {
  //     await this.users.update({ id: existing.id }, { fullName: input.fullName, phone: input.phone });
  //     return this.getById(existing.id);
  //   }
  //   const created = await this.users.save(
  //     this.users.create({
  //       fullName: input.fullName,
  //       email,
  //       phone: input.phone,
  //       role: 'external',
  //       ssoSubject: null,
  //     }),
  //   );
  //   return this.getById(created.id);
  // }
  //
  // async markExternalVerified(userId: string, phoneToo: boolean): Promise<void> {
  //   const now = new Date();
  //   await this.users.update(
  //     { id: userId },
  //     phoneToo
  //       ? { emailVerifiedAt: now, phoneVerifiedAt: now, lastActiveAt: now }
  //       : { emailVerifiedAt: now, lastActiveAt: now },
  //   );
  // }

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
    const [rows, total] = await this.users.findAndCount({
      where,
      order: { fullName: 'ASC' },
      ...pageOffset(query),
    });
    return pageOf(
      query,
      rows.map((u) => this.toResponse(u)),
      total,
    );
  }

  async suspend(actor: AuthUser, id: string, until: Date, reason: string): Promise<UserResponse> {
    if (until.getTime() <= Date.now()) {
      throw new AppException('VALIDATION_FAILED', {
        details: { fields: { until: ['must be in the future'] } },
      });
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
  async deleteSelf(user: AuthUser): Promise<CancelledBooking[]> {
    if (user.role === 'admin') throw new AppException('FORBIDDEN');
    return this.dataSource.transaction((em) =>
      this.removeAccount(em, user.id, 'user', { actorId: null, after: { self_service: true } }),
    );
  }

  /**
   * An administrator deletes another account, with the same anonymization as DELETE /me.
   * The insert-only audit log references its actors, so an account that acted there cannot be deleted.
   */
  async deleteByAdmin(actor: AuthUser, id: string): Promise<CancelledBooking[]> {
    if (id === actor.id) throw new AppException('FORBIDDEN');
    return this.dataSource.transaction(async (em) => {
      const target = await em.getRepository(User).findOneBy({ id });
      if (!target) throw new AppException('NOT_FOUND');
      const acted = await em.query(`SELECT 1 FROM audit_log WHERE actor_id = $1 LIMIT 1`, [id]);
      if (acted.length) throw new AppException('USER_HAS_HISTORY');
      return this.removeAccount(em, id, 'admin', {
        actorId: actor.id,
        before: { full_name: target.fullName, email: target.email, role: target.role },
        after: { self_service: false },
      });
    });
  }

  /** NFR-11 / SDD 5.3 inside the caller's transaction. Returns the cancelled future bookings. */
  private async removeAccount(
    em: EntityManager,
    userId: string,
    cancelSource: 'user' | 'admin',
    audit: { actorId: string | null; before?: Record<string, unknown>; after: Record<string, unknown> },
  ): Promise<CancelledBooking[]> {
    const cancelled: { id: string; resource_id: string; start: Date; end: Date }[] = rowsOf(
      await em.query(
        `UPDATE occupancy SET status = 'cancelled', cancel_source = $2
         WHERE user_id = $1 AND kind = 'booking' AND status = 'active' AND lower(period) > now()
         RETURNING id, resource_id, lower(period) AS start, upper(period) AS "end"`,
        [userId, cancelSource],
      ),
    );
    await em.query(`UPDATE occupancy SET user_id = NULL, anonymized_at = now() WHERE user_id = $1`, [userId]);
    // Bookings made through the API record their creator too (occupancy_created_by_fkey).
    await em.query(`UPDATE occupancy SET created_by = NULL WHERE created_by = $1`, [userId]);
    // user_avatars, waitlist, quota, notifications and push subscriptions go with ON DELETE CASCADE.
    await em.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await this.audit.record({ ...audit, action: 'user.delete', entity: 'user', entityId: userId }, em);
    return cancelled.map((r) => ({
      id: r.id,
      userId: null,
      resourceId: r.resource_id,
      start: r.start,
      end: r.end,
    }));
  }

  /** An administrator creates an account of any role (FR-05). */
  async createByAdmin(actor: AuthUser, input: CreateUserDto): Promise<UserResponse> {
    const email = normalizeEmail(input.email);
    const phone = input.phone ?? null;
    if (input.role === 'external' && !phone) throw phoneRequired();
    const passwordHash = await hashPassword(input.password);
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(User);
      if (await repo.existsBy({ email })) throw new AppException('EMAIL_ALREADY_USED');
      const created = await repo
        .save(
          repo.create({
            fullName: input.full_name,
            email,
            phone,
            role: input.role,
            ssoSubject: null,
            passwordHash,
          }),
        )
        .catch(rethrowDuplicateEmail);
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.create',
          entity: 'user',
          entityId: created.id,
          after: { full_name: input.full_name, email, phone, role: input.role },
        },
        em,
      );
      return this.toResponse((await repo.findOneBy({ id: created.id }))!);
    });
  }

  /**
   * Partial update by an administrator. `signOut` tells the caller to end the account's sessions:
   * role, email or password changed (never for the acting admin's own sessions).
   */
  async updateByAdmin(
    actor: AuthUser,
    id: string,
    input: UpdateUserDto,
  ): Promise<{ user: UserResponse; signOut: boolean }> {
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(User);
      const user = await repo.findOneBy({ id });
      if (!user) throw new AppException('NOT_FOUND');
      if (id === actor.id && input.role !== undefined && input.role !== 'admin') {
        throw new AppException('FORBIDDEN');
      }

      const changes: Partial<User> = {};
      if (input.full_name !== undefined && input.full_name !== user.fullName)
        changes.fullName = input.full_name;
      if (input.email !== undefined) {
        const email = normalizeEmail(input.email);
        if (email !== user.email) {
          if (await repo.existsBy({ email })) throw new AppException('EMAIL_ALREADY_USED');
          changes.email = email;
        }
      }
      if (input.phone !== undefined && input.phone !== user.phone) changes.phone = input.phone;
      if (input.role !== undefined && input.role !== user.role) changes.role = input.role;
      const role = changes.role ?? user.role;
      const phone = changes.phone !== undefined ? changes.phone : user.phone;
      if (role === 'external' && !phone) throw phoneRequired();

      if (Object.keys(changes).length || passwordHash) {
        await repo
          .update({ id }, { ...changes, ...(passwordHash ? { passwordHash } : {}) })
          .catch(rethrowDuplicateEmail);
        const pick = (u: Partial<User>) => ({
          ...(u.fullName !== undefined ? { full_name: u.fullName } : {}),
          ...(u.email !== undefined ? { email: u.email } : {}),
          ...(u.phone !== undefined ? { phone: u.phone } : {}),
          ...(u.role !== undefined ? { role: u.role } : {}),
        });
        const keys = Object.keys(changes) as (keyof User)[];
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'user.update',
            entity: 'user',
            entityId: id,
            before: pick(Object.fromEntries(keys.map((k) => [k, user[k]]))),
            after: { ...pick(changes), ...(passwordHash ? { password_changed: true } : {}) },
          },
          em,
        );
      }
      const signOut = id !== actor.id && Boolean(changes.role || changes.email || passwordHash);
      return { user: this.toResponse((await repo.findOneBy({ id }))!), signOut };
    });
  }
}

function phoneRequired(): AppException {
  return new AppException('VALIDATION_FAILED', {
    details: { fields: { phone: ['required for the external role'] } },
  });
}

/** Two writes with the same email at once: users_email_uq decides. */
function rethrowDuplicateEmail(err: unknown): never {
  if (pgErrorCode(err) === '23505') throw new AppException('EMAIL_ALREADY_USED');
  throw err;
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}
