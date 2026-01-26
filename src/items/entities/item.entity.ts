import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Category } from '../../category/entities/category.entity';
import { Store } from '../../stores/entities/store.entity';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';

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

  @Column()
  location: string;

  @Column('int', { default: 1 })
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  purchasePrice: number;

  @Column('decimal', { precision: 10, scale: 2 })
  minimumSalePrice: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ default: false })
  is_archived: boolean;
}
