import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { StockLot } from './stock-lot.entity';
import { SaleItem } from '../../sale-items/entities/sale-item.entity';
import { OrderItem } from '../../order-items/entities/order-item.entity';

@Entity('stock_allocations')
export class StockAllocation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => StockLot, lot => lot.allocations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lot_id' })
  lot: StockLot;

  @Column('int')
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  unitCost: number;

  @ManyToOne(() => SaleItem, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_item_id' })
  saleItem: SaleItem | null;

  @ManyToOne(() => OrderItem, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_item_id' })
  orderItem: OrderItem | null;

  @Column({ default: false })
  is_archived: boolean;
}
