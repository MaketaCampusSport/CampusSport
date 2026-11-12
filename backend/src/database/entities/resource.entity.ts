import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { ExternalAccess } from '../enums';
import { Sport } from './sport.entity';

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export interface TimeOfDayRange {
  open: string;
  close: string;
}
/** Weekly schedule; a missing day means closed (WeeklyHours in openapi.yaml). */
export type WeeklyHours = Partial<Record<Weekday, TimeOfDayRange[]>>;

@Entity({ name: 'resources' })
export class Resource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  type: string;

  @Column({ type: 'text' })
  location: string;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @Column({ type: 'integer' })
  capacity: number;

  @Column({ type: 'text', array: true })
  equipment: string[];

  @Column({ name: 'opening_hours', type: 'jsonb' })
  openingHours: WeeklyHours;

  @Column({ name: 'slot_minutes', type: 'integer' })
  slotMinutes: number;

  @Column({ name: 'external_access', type: 'text' })
  externalAccess: ExternalAccess;

  @Column({ name: 'external_access_windows', type: 'jsonb', nullable: true })
  externalAccessWindows: WeeklyHours | null;

  @Column({ type: 'boolean' })
  active: boolean;

  @ManyToMany(() => Sport)
  @JoinTable({
    name: 'resource_sports',
    joinColumn: { name: 'resource_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'sport_id', referencedColumnName: 'id' },
  })
  sports?: Sport[];
}
