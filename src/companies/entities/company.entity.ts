import { Entity, Column, PrimaryGeneratedColumn, ManyToMany, JoinTable, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { Category } from '../../category/entities/category.entity';
import { Item } from '../../items/entities/item.entity';
import { User } from '../../users/entities/user.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToMany(() => Category, category => category.companies)
  @JoinTable({
    name: 'company_categories',
    joinColumn: { name: 'company_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' }
  })
  categories: Category[];

  @OneToMany(() => Item, item => item.company)
  items: Item[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ default: false })
  is_archived: boolean;
}
