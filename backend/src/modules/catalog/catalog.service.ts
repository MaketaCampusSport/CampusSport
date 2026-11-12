import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import { Resource, Sport } from '../../database/entities';
import type { WeeklyHours } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { invalidRanges } from '../availability/slots';
import { SettingsService } from '../settings/settings.service';
import {
  ResourceCreateDto,
  ResourcePatchDto,
  ResourceResponse,
  SportInputDto,
  SportResponse,
  toResourceResponse,
  toSportResponse,
} from './dto/catalog.dto';

function validationError(fields: Record<string, string[]>): AppException {
  return new AppException('VALIDATION_FAILED', { details: { fields } });
}

/** SDD module "Catalog": sports, resources, equipment, opening hours (FR-04, FR-06 – FR-08, FR-39). */
@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Sport) private readonly sports: Repository<Sport>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Sports ----------

  async listSports(): Promise<SportResponse[]> {
    const rows = await this.sports.find({ order: { nameRo: 'ASC' } });
    return rows.map(toSportResponse);
  }

  async getSport(id: string): Promise<Sport> {
    const sport = await this.sports.findOneBy({ id });
    if (!sport) throw new AppException('NOT_FOUND');
    return sport;
  }

  async createSport(actor: AuthUser, dto: SportInputDto): Promise<SportResponse> {
    return this.dataSource.transaction(async (em) => {
      const sport = await em.getRepository(Sport).save({
        nameRo: dto.name_ro,
        nameEn: dto.name_en,
        icon: dto.icon,
        requiredEquipment: dto.required_equipment,
      });
      const after = toSportResponse(sport);
      await this.audit.record({ actorId: actor.id, action: 'sport.create', entity: 'sport', entityId: sport.id, after: { ...after } }, em);
      return after;
    });
  }

  async updateSport(actor: AuthUser, id: string, dto: SportInputDto): Promise<SportResponse> {
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Sport);
      const sport = await repo.findOneBy({ id });
      if (!sport) throw new AppException('NOT_FOUND');
      const before = toSportResponse(sport);
      Object.assign(sport, {
        nameRo: dto.name_ro,
        nameEn: dto.name_en,
        icon: dto.icon,
        requiredEquipment: dto.required_equipment,
      });
      const after = toSportResponse(await repo.save(sport));
      await this.audit.record(
        { actorId: actor.id, action: 'sport.update', entity: 'sport', entityId: id, before: { ...before }, after: { ...after } },
        em,
      );
      return after;
    });
  }

  // ---------- Resources ----------

  /** With `sportId`, only resources allowed for the sport AND having all its required equipment (SRS 9.5). */
  async findResources(options: { sportId?: string; includeInactive?: boolean; ids?: string[] }): Promise<Resource[]> {
    const qb = this.resources
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.sports', 's')
      .orderBy('r.name', 'ASC')
      .addOrderBy('s.id', 'ASC');
    if (!options.includeInactive) qb.andWhere('r.active = true');
    if (options.ids) qb.andWhere('r.id IN (:...ids)', { ids: options.ids.length ? options.ids : [null] });
    if (options.sportId) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM resource_sports rs JOIN sports sp ON sp.id = rs.sport_id
                 WHERE rs.resource_id = r.id AND rs.sport_id = :sportId AND r.equipment @> sp.required_equipment)`,
        { sportId: options.sportId },
      );
    }
    return qb.getMany();
  }

  async listResources(caller: AuthUser | undefined, sportId?: string, includeInactive?: boolean): Promise<ResourceResponse[]> {
    const rows = await this.findResources({ sportId, includeInactive: includeInactive && caller?.role === 'admin' });
    return rows.map(toResourceResponse);
  }

  /** Inactive resources are visible only to administrators. */
  async getResource(id: string, caller?: AuthUser): Promise<Resource> {
    const resource = await this.resources.findOne({ where: { id }, relations: { sports: true } });
    if (!resource || (!resource.active && caller?.role !== 'admin')) throw new AppException('NOT_FOUND');
    return resource;
  }

  async createResource(actor: AuthUser, dto: ResourceCreateDto): Promise<ResourceResponse> {
    const rules = await this.settings.rules();
    const externalAccess = dto.external_access ?? 'leftover';
    this.checkSchedules(dto.opening_hours as WeeklyHours, externalAccess, dto.external_access_windows as WeeklyHours | null | undefined);
    return this.dataSource.transaction(async (em) => {
      const sports = await this.loadSports(em.getRepository(Sport), dto.sport_ids);
      const repo = em.getRepository(Resource);
      const saved = await repo.save(
        repo.create({
          name: dto.name,
          type: dto.type,
          location: dto.location,
          photoUrl: dto.photo_url ?? null,
          capacity: dto.capacity,
          equipment: dto.equipment ?? [],
          openingHours: dto.opening_hours as WeeklyHours,
          slotMinutes: dto.slot_minutes ?? rules.default_slot_minutes,
          externalAccess,
          externalAccessWindows: (dto.external_access_windows as WeeklyHours | null | undefined) ?? null,
          active: dto.active ?? true,
          sports,
        }),
      );
      const after = toResourceResponse(saved);
      await this.audit.record(
        { actorId: actor.id, action: 'resource.create', entity: 'resource', entityId: saved.id, after: { ...after } },
        em,
      );
      return after;
    });
  }

  /** Deactivation is `active = false`; future bookings are handled separately with a block (spec). */
  async updateResource(actor: AuthUser, id: string, dto: ResourcePatchDto): Promise<ResourceResponse> {
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Resource);
      const resource = await repo.findOne({ where: { id }, relations: { sports: true } });
      if (!resource) throw new AppException('NOT_FOUND');
      const before = toResourceResponse(resource);

      const patch: Partial<Resource> = {};
      if (dto.name !== undefined) patch.name = dto.name;
      if (dto.type !== undefined) patch.type = dto.type;
      if (dto.location !== undefined) patch.location = dto.location;
      if (dto.photo_url !== undefined) patch.photoUrl = dto.photo_url;
      if (dto.capacity !== undefined) patch.capacity = dto.capacity;
      if (dto.equipment !== undefined) patch.equipment = dto.equipment;
      if (dto.opening_hours !== undefined) patch.openingHours = dto.opening_hours as WeeklyHours;
      if (dto.slot_minutes !== undefined) patch.slotMinutes = dto.slot_minutes;
      if (dto.external_access !== undefined) patch.externalAccess = dto.external_access;
      if (dto.external_access_windows !== undefined) patch.externalAccessWindows = dto.external_access_windows as WeeklyHours | null;
      if (dto.active !== undefined) patch.active = dto.active;
      Object.assign(resource, patch);
      this.checkSchedules(resource.openingHours, resource.externalAccess, resource.externalAccessWindows);
      if (dto.sport_ids !== undefined) resource.sports = await this.loadSports(em.getRepository(Sport), dto.sport_ids);

      const after = toResourceResponse(await repo.save(resource));
      await this.audit.record(
        { actorId: actor.id, action: 'resource.update', entity: 'resource', entityId: id, before: { ...before }, after: { ...after } },
        em,
      );
      return after;
    });
  }

  private async loadSports(repo: Repository<Sport>, ids: string[]): Promise<Sport[]> {
    const sports = ids.length ? await repo.findBy({ id: In(ids) }) : [];
    const missing = ids.filter((id) => !sports.some((s) => s.id === id));
    if (missing.length) throw validationError({ sport_ids: [`unknown sports: ${missing.join(', ')}`] });
    return sports;
  }

  private checkSchedules(opening: WeeklyHours, externalAccess: string, windows: WeeklyHours | null | undefined): void {
    const fields: Record<string, string[]> = {};
    const openingProblems = invalidRanges(opening);
    if (openingProblems.length) fields.opening_hours = openingProblems;
    const windowProblems = invalidRanges(windows);
    if (windowProblems.length) fields.external_access_windows = windowProblems;
    if (externalAccess === 'window' && !windows) {
      fields.external_access_windows = ['required when external_access is "window"'];
    }
    if (Object.keys(fields).length) throw validationError(fields);
  }
}
