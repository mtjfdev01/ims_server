import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { Item } from '../../items/entities/item.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Order, order => order.orderItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column()
  quantity: number;

  @Column({ default: 0 })
  returnedQuantity: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  amount: number;

  @Column({ default: false })
  is_archived: boolean;
}
