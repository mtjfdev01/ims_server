import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToMany, JoinTable, ManyToOne, JoinColumn } from 'typeorm';
import { Shop } from '../../shops/entities/shop.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { UserRole } from '../../common/request-context';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column()
  password: string;

  @Column({ type: 'varchar', length: 32, default: UserRole.USER })
  role: UserRole;

  @ManyToOne(() => Tenant, tenant => tenant.users, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  visiblePassword: string | null;

  @ManyToMany(() => Shop, shop => shop.users)
  @JoinTable({
    name: 'user_shops',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'shop_id', referencedColumnName: 'id' }
  })
  shops: Shop[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  is_archived: boolean;
}
