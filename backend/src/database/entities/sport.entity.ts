import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sports' })
export class Sport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name_ro', type: 'text' })
  nameRo: string;

  @Column({ name: 'name_en', type: 'text' })
  nameEn: string;

  @Column({ type: 'text' })
  icon: string;

  @Column({ name: 'required_equipment', type: 'text', array: true })
  requiredEquipment: string[];
}
