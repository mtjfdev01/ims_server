import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { InstallmentDue } from './installment-due.entity';
import type { InstallmentSchedule, PaymentStatus } from '../../common/payment.util';

@Entity('installment_plans')
export class InstallmentPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column('decimal', { precision: 10, scale: 2 })
  totalAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  downPayment: number;

  @Column({ type: 'int' })
  installmentCount: number;

  @Column('decimal', { precision: 10, scale: 2 })
  installmentAmount: number;

  @Column({ type: 'varchar', length: 30, default: 'first_of_month' })
  schedule: InstallmentSchedule;

  @Column({ type: 'int', default: 1 })
  dayOfMonth: number;

  @Column({ type: 'date' })
  firstDueDate: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  amountPaid: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  paymentStatus: PaymentStatus;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @ManyToOne(() => Shop, { nullable: false })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @OneToMany(() => InstallmentDue, due => due.plan, { cascade: true })
  dues: InstallmentDue[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: false })
  is_archived: boolean;

  balance?: number;
  completedCount?: number;
  pendingCount?: number;
  upcomingCount?: number;
}
