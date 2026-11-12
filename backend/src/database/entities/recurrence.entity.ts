import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { BlockKind } from '../enums';

@Entity({ name: 'recurrences' })
export class Recurrence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** iCal RRULE, e.g. FREQ=WEEKLY;BYDAY=TU */
  @Column({ type: 'text' })
  rule: string;

  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId: string;

  @Column({ type: 'text' })
  kind: BlockKind;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date' })
  validTo: string;

  @Column({ name: 'source_file', type: 'text', nullable: true })
  sourceFile: string | null;
}
