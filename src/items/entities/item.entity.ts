import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, ManyToMany, JoinTable, OneToMany, CreateDateColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Category } from '../../category/entities/category.entity';
import { Store } from '../../stores/entities/store.entity';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';
import { StockLot } from '../../stock-lots/entities/stock-lot.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({nullable:true, type:'varchar', length:255})
  name: string;

  @ManyToOne(() => Company, company => company.items)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToMany(() => Category)
  @JoinTable({
    name: 'item_categories',
    joinColumn: { name: 'item_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' }
  })
  categories: Category[];

  @ManyToOne(() => Store, { nullable: true })
  @JoinColumn({ name: 'store_id' })
  store: Store | null;

  @ManyToOne(() => Shop, { nullable: true })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column('int', { default: 1 })
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  purchasePrice: number;

  @Column('decimal', { precision: 10, scale: 2 })
  minimumSalePrice: number;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @OneToMany(() => StockLot, lot => lot.item)
  lots: StockLot[];

  @Column({ default: false })
  is_archived: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
