import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { Store } from '../../stores/entities/store.entity';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';

@Entity('issues')
export class Issue {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @ManyToOne(() => Store, { nullable: true })
  @JoinColumn({ name: 'from_store_id' })
  fromStore: Store | null;

  @ManyToOne(() => Shop, { nullable: true })
  @JoinColumn({ name: 'from_shop_id' })
  fromShop: Shop | null;

  @ManyToOne(() => Store, { nullable: true })
  @JoinColumn({ name: 'to_store_id' })
  toStore: Store | null;

  @ManyToOne(() => Shop, { nullable: true })
  @JoinColumn({ name: 'to_shop_id' })
  toShop: Shop | null;

  @Column()
  quantity: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  issuedDate: Date;

  @Column({ nullable: true })
  notes: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ default: false })
  is_archived: boolean;
}
