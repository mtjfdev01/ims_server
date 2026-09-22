import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { ServicePayment } from '../../service-payments/entities/service-payment.entity';
import type { InstallmentFrequency, PaymentStatus } from '../../common/payment.util';

@Entity('service_jobs')
export class ServiceJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'varchar', length: 80, default: 'other' })
  kind: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  amount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  profit: number;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @ManyToOne(() => Shop, { nullable: true })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  paymentStatus: PaymentStatus;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  amountPaid: number | null;

  @Column({ type: 'date', nullable: true })
  promiseDate: string | null;

  @Column({ type: 'varchar', length: 20, default: 'none' })
  installmentFrequency: InstallmentFrequency;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  installmentAmount: number | null;

  @Column({ type: 'date', nullable: true })
  nextDueDate: string | null;

  @OneToMany(() => ServicePayment, payment => payment.serviceJob, { cascade: true })
  payments: ServicePayment[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: false })
  is_archived: boolean;

  balance?: number;
}
