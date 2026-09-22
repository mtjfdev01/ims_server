import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from './entities/store.entity';
import { Item } from '../items/entities/item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { FifoService } from '../stock-lots/fifo.service';
import { requireSuperAdmin, requireTenantId, requireUser, skipsShopFilter, stampOwnership, tenantWhere } from '../common/access.util';
import { PaginationResult } from '../common/pagination.dto';
import { FilterDto } from '../common/filter.dto';
import { paginateQuery } from '../common/pagination.util';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private storesRepository: Repository<Store>,
    @InjectRepository(Item)
    private itemRepository: Repository<Item>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
    private fifoService: FifoService,
  ) {}

  async create(createStoreDto: CreateStoreDto): Promise<Store> {
    const store = this.storesRepository.create({
      name: createStoreDto.name,
      location: createStoreDto.location,
    });
    stampOwnership(store);

    if (createStoreDto.shopIds && createStoreDto.shopIds.length > 0) {
      const shops = await this.shopRepository.find({
        where: tenantWhere({ id: In(createStoreDto.shopIds) }),
      });
      store.shops = shops;
    }

    return this.storesRepository.save(store);
  }

  async findAll(filterDto?: FilterDto): Promise<Store[] | PaginationResult<Store>> {
    const queryBuilder = this.storesRepository.createQueryBuilder('store')
      .leftJoinAndSelect('store.shops', 'shops')
      .where('store.is_archived = :archived', { archived: false });

    const scoped = tenantWhere();
    if (scoped.tenant) {
      queryBuilder.andWhere('store.tenant_id = :tenantId', { tenantId: scoped.tenant.id });
    }

    if (!skipsShopFilter(requireUser())) {
      const ids = requireUser().shopIds.length ? requireUser().shopIds : [-1];
      queryBuilder.andWhere('shops.id IN (:...shopIds)', { shopIds: ids });
      queryBuilder.distinct(true);
    }
    if (filterDto?.search?.trim()) {
      const term = `%${filterDto.search.trim()}%`;
      queryBuilder.andWhere('(store.name ILIKE :term OR store.location ILIKE :term)', { term });
    }

    return paginateQuery(queryBuilder, filterDto);
  }

  async findOne(id: number): Promise<Store | null> {
    const store = await this.storesRepository.findOne({ 
      where: tenantWhere({ id, is_archived: false }),
      relations: ['shops']
    });
    if (!store) {
      return null;
    }
    const user = requireUser();
    if (skipsShopFilter(user)) {
      return store;
    }
    const allowed = (store.shops || []).some(shop => user.shopIds.includes(Number(shop.id)));
    return allowed ? store : null;
  }

  async update(id: number, updateStoreDto: UpdateStoreDto): Promise<Store | null> {
    const store = await this.findOne(id);
    if (!store) {
      return null;
    }

    if (updateStoreDto.name !== undefined) store.name = updateStoreDto.name;
    if (updateStoreDto.location !== undefined) store.location = updateStoreDto.location;

    if (updateStoreDto.shopIds !== undefined) {
      if (updateStoreDto.shopIds.length > 0) {
        const shops = await this.shopRepository.find({
          where: tenantWhere({ id: In(updateStoreDto.shopIds) }),
        });
        store.shops = shops;
      } else {
        store.shops = [];
      }
    }

    return this.storesRepository.save(store);
  }

  async remove(id: number): Promise<boolean> {
    requireSuperAdmin();
    const store = await this.storesRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
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
    requireSuperAdmin();
    requireTenantId();
    const result = await this.storesRepository.update(tenantWhere({ is_archived: false }), { is_archived: true });
    return result.affected || 0;
  }

  async getItems(storeId: number): Promise<Item[]> {
    const store = await this.findOne(storeId);
    if (!store) {
      return [];
    }
    return this.itemRepository.find({
      where: tenantWhere({ store: { id: storeId }, is_archived: false }),
      relations: ['company', 'categories', 'store', 'shop'],
    });
  }

  async getAssetValue(storeId: number): Promise<number> {
    const store = await this.findOne(storeId);
    if (!store) {
      return 0;
    }
    const items = await this.itemRepository.find({
      where: tenantWhere({ store: { id: storeId }, is_archived: false }),
      select: ['id'],
    });

    return this.fifoService.getAssetValue(items.map(item => item.id));
  }
}
