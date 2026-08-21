import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { Purchase } from '../../purchases/entities/purchase.entity';
import { StockAllocation } from './stock-allocation.entity';

@Entity('stock_lots')
export class StockLot {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Item, item => item.lots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column('int')
  originalQuantity: number;

  @Column('int')
  remainingQuantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  unitCost: number;

  @Column({ type: 'timestamp' })
  receivedAt: Date;

  @ManyToOne(() => Purchase, { nullable: true })
  @JoinColumn({ name: 'purchase_id' })
  purchase: Purchase | null;

  @OneToMany(() => StockAllocation, allocation => allocation.lot)
  allocations: StockAllocation[];

  @Column({ default: false })
  is_archived: boolean;
}
