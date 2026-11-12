import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from '../../database/entities';

export interface AuditRecord {
  actorId: string | null;
  /** e.g. `user.suspend`, `block.create`, `settings.update` */
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/** Writes the insert-only audit log for every admin action (FR-45). */
@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  /** Pass the transaction's EntityManager so the entry commits (or rolls back) with the change. */
  async record(entry: AuditRecord, em?: EntityManager): Promise<void> {
    const repo = em ? em.getRepository(AuditLog) : this.repo;
    // jsonb values are passed through createQueryBuilder so TypeORM does not treat them as partial entities.
    await repo
      .createQueryBuilder()
      .insert()
      .values({
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: (entry.before ?? null) as never,
        after: (entry.after ?? null) as never,
      })
      .execute();
  }
}
