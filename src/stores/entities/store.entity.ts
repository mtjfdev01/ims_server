import { Entity, Column, PrimaryGeneratedColumn, ManyToMany, ManyToOne, JoinColumn } from 'typeorm';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';

@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  location: string;

  @ManyToMany(() => Shop, shop => shop.stores)
  shops: Shop[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ default: false })
  is_archived: boolean;
}
