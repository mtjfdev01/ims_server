import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from './entities/store.entity';
import { Item } from '../items/entities/item.entity';
import { Shop } from '../shops/entities/shop.entity';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private storesRepository: Repository<Store>,
    @InjectRepository(Item)
    private itemRepository: Repository<Item>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
  ) {}

  async create(createStoreDto: CreateStoreDto): Promise<Store> {
    const store = this.storesRepository.create({
      name: createStoreDto.name,
      location: createStoreDto.location,
    });

    if (createStoreDto.shopIds && createStoreDto.shopIds.length > 0) {
      const shops = await this.shopRepository.findBy({
        id: In(createStoreDto.shopIds),
      });
      store.shops = shops;
    }

    return this.storesRepository.save(store);
  }

  findAll(): Promise<Store[]> {
    return this.storesRepository.find({ 
      where: { is_archived: false },
      relations: ['shops'] 
    });
  }

  findOne(id: number): Promise<Store | null> {
    return this.storesRepository.findOne({ 
      where: { id, is_archived: false },
      relations: ['shops']
    });
  }

  async update(id: number, updateStoreDto: UpdateStoreDto): Promise<Store | null> {
    const store = await this.storesRepository.findOne({
      where: { id, is_archived: false },
      relations: ['shops'],
    });

    if (!store) {
      return null;
    }

    if (updateStoreDto.name !== undefined) store.name = updateStoreDto.name;
    if (updateStoreDto.location !== undefined) store.location = updateStoreDto.location;

    if (updateStoreDto.shopIds !== undefined) {
      if (updateStoreDto.shopIds.length > 0) {
        const shops = await this.shopRepository.findBy({
          id: In(updateStoreDto.shopIds),
        });
        store.shops = shops;
      } else {
        store.shops = [];
      }
    }

    return this.storesRepository.save(store);
  }

  async remove(id: number): Promise<boolean> {
    const store = await this.storesRepository.findOne({
      where: { id, is_archived: false },
    });

    if (!store) {
      return false;
    }

    // Soft delete: mark as archived instead of deleting
    store.is_archived = true;
    await this.storesRepository.save(store);
    return true;
  }

  async removeAll(): Promise<number> {
    // Soft delete: mark all stores as archived
    const result = await this.storesRepository.update({ is_archived: false }, { is_archived: true });
    return result.affected || 0;
  }

  async getItems(storeId: number): Promise<Item[]> {
    return this.itemRepository.find({
      where: { store: { id: storeId }, is_archived: false },
      relations: ['company', 'categories', 'store', 'shop'],
    });
  }

  async getAssetValue(storeId: number): Promise<number> {
    const items = await this.itemRepository.find({
      where: { store: { id: storeId }, is_archived: false },
      select: ['quantity', 'purchasePrice'],
    });

    return items.reduce((total, item) => {
      const price = typeof item.purchasePrice === 'string' 
        ? parseFloat(item.purchasePrice) 
        : item.purchasePrice;
      const quantity = item.quantity || 1;
      return total + (price || 0) * quantity;
    }, 0);
  }
}
