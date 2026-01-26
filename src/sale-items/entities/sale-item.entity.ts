import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Sale } from '../../sales/entities/sale.entity';
import { Item } from '../../items/entities/item.entity';

@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Sale, sale => sale.saleItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column()
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  profit: number;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ default: false })
  is_archived: boolean;
}
