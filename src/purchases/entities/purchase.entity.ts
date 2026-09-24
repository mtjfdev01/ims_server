import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Seller } from '../../sellers/entities/seller.entity';

@Entity('purchases')
export class Purchase {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column('decimal', { precision: 10, scale: 2 })
  purchasePrice: number;

  @Column('int', { default: 1 })
  quantity: number;

  @Column({ type: 'date', nullable: true })
  purchaseDate: Date;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @ManyToOne(() => Shop, { nullable: true })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @ManyToOne(() => Seller, seller => seller.purchases, { nullable: true })
  @JoinColumn({ name: 'seller_id' })
  seller: Seller | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: false })
  is_archived: boolean;
}
