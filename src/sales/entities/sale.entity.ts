import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { SaleItem } from '../../sale-items/entities/sale-item.entity';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { SalePayment } from '../../sale-payments/entities/sale-payment.entity';
import type { InstallmentFrequency, PaymentStatus } from '../../common/payment.util';

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany(() => SaleItem, saleItem => saleItem.sale, { cascade: true })
  saleItems: SaleItem[];

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  totalProfit: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  totalAmount: number;

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

  @OneToMany(() => SalePayment, payment => payment.sale, { cascade: true })
  payments: SalePayment[];

  @ManyToOne(() => Order, { nullable: true })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: false })
  is_archived: boolean;

  balance?: number;
}
