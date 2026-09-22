import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ServiceJob } from '../../service-jobs/entities/service-job.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { User } from '../../users/entities/user.entity';

@Entity('service_payments')
export class ServicePayment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ServiceJob, job => job.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_job_id' })
  serviceJob: ServiceJob;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'date' })
  paidOn: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @CreateDateColumn()
  createdAt: Date;
}
