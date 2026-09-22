import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { InstallmentPlan } from './installment-plan.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';
import type { DueStatus } from '../../common/payment.util';

@Entity('installment_dues')
export class InstallmentDue {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => InstallmentPlan, plan => plan.dues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: InstallmentPlan;

  @Column({ type: 'int' })
  sequence: number;

  @Column({ type: 'date' })
  dueDate: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ type: 'date', nullable: true })
  paidOn: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @ManyToOne(() => Shop, { nullable: false })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: false })
  is_archived: boolean;

  status?: DueStatus;
  remaining?: number;
}
