import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { Shop } from './entities/shop.entity';
import { Item } from '../items/entities/item.entity';
import { Store } from '../stores/entities/store.entity';
import { User } from '../users/entities/user.entity';
import { FifoService } from '../stock-lots/fifo.service';
import { PaginationDto, PaginationResult } from '../common/pagination.dto';
import { paginate } from '../common/pagination.util';

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop)
    private shopsRepository: Repository<Shop>,
    @InjectRepository(Item)
    private itemRepository: Repository<Item>,
    @InjectRepository(Store)
    private storeRepository: Repository<Store>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private fifoService: FifoService,
  ) {}

  async create(createShopDto: CreateShopDto, userId?: number): Promise<Shop> {
    const shop = this.shopsRepository.create({
      name: createShopDto.name,
      branch: createShopDto.branch,
      dealer: createShopDto.dealer,
      location: createShopDto.location,
    });

    if (createShopDto.storeIds && createShopDto.storeIds.length > 0) {
      const stores = await this.storeRepository.findBy({
        id: In(createShopDto.storeIds),
      });
      shop.stores = stores;
    }

    // Assign shop to user if userId is provided
    if (userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user) {
        shop.users = [user];
        shop.createdBy = user;
      }
    }

    return this.shopsRepository.save(shop);
  }

  async findAll(paginationDto?: PaginationDto, userId?: number): Promise<Shop[] | PaginationResult<Shop>> {
    if (userId) {
      // Filter shops by user
      const queryBuilder = this.shopsRepository.createQueryBuilder('shop')
        .leftJoinAndSelect('shop.stores', 'stores')
        .leftJoin('shop.users', 'user')
        .where('user.id = :userId', { userId })
        .andWhere('shop.is_archived = :archived', { archived: false });

      if (paginationDto && (paginationDto.page || paginationDto.limit)) {
        const page = paginationDto.page || 1;
        const limit = paginationDto.limit || 10;
        const skip = (page - 1) * limit;

        const [data, total] = await queryBuilder
          .skip(skip)
          .take(limit)
          .getManyAndCount();

        return {
          data,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        };
      }

      return queryBuilder.getMany();
    }

    // If no userId, return all shops (for admin or when no user context)
    if (paginationDto && (paginationDto.page || paginationDto.limit)) {
      const baseWhere = { is_archived: false };
      return paginate(this.shopsRepository, paginationDto || { page: 1, limit: 10 }, baseWhere, ['stores']);
    }
    const shops = await this.shopsRepository.find({ 
      where: { is_archived: false },
      relations: ['stores'] 
    });
    return shops;
  }

  findOne(id: number, userId?: number): Promise<Shop | null> {
    const queryBuilder = this.shopsRepository.createQueryBuilder('shop')
      .leftJoinAndSelect('shop.stores', 'stores')
      .where('shop.id = :id', { id })
      .andWhere('shop.is_archived = :archived', { archived: false });

    if (userId) {
      queryBuilder
        .leftJoin('shop.users', 'user')
        .andWhere('user.id = :userId', { userId });
    }

    return queryBuilder.getOne();
  }

  async update(id: number, updateShopDto: UpdateShopDto): Promise<Shop | null> {
    const shop = await this.shopsRepository.findOne({
      where: { id, is_archived: false },
      relations: ['stores'],
    });

    if (!shop) {
      return null;
    }

    if (updateShopDto.name !== undefined) shop.name = updateShopDto.name;
    if (updateShopDto.branch !== undefined) shop.branch = updateShopDto.branch;
    if (updateShopDto.dealer !== undefined) shop.dealer = updateShopDto.dealer;
    if (updateShopDto.location !== undefined) shop.location = updateShopDto.location;

    if (updateShopDto.storeIds !== undefined) {
      if (updateShopDto.storeIds.length > 0) {
        const stores = await this.storeRepository.findBy({
          id: In(updateShopDto.storeIds),
        });
        shop.stores = stores;
      } else {
        shop.stores = [];
      }
    }

    return this.shopsRepository.save(shop);
  }

  async remove(id: number): Promise<boolean> {
    const shop = await this.shopsRepository.findOne({
      where: { id, is_archived: false },
    });

    if (!shop) {
      return false;
    }

    // Soft delete: mark as archived instead of deleting
    shop.is_archived = true;
    await this.shopsRepository.save(shop);
    return true;
  }

  async removeAll(): Promise<number> {
    // Soft delete: mark all shops as archived
    const result = await this.shopsRepository.update({ is_archived: false }, { is_archived: true });
    return result.affected || 0;
  }

  async getItems(shopId: number, userId?: number): Promise<Item[]> {
    // First verify user has access to this shop
    if (userId) {
      const shop = await this.findOne(shopId, userId);
      if (!shop) {
        throw new Error('Shop not found or access denied');
      }
    }

    return this.itemRepository.find({
      where: { shop: { id: shopId }, is_archived: false },
      relations: ['company', 'categories', 'store', 'shop'],
    });
  }

  async getAssetValue(shopId: number, userId?: number): Promise<number> {
    // First verify user has access to this shop
    if (userId) {
      const shop = await this.findOne(shopId, userId);
      if (!shop) {
        throw new Error('Shop not found or access denied');
      }
    }

    const items = await this.itemRepository.find({
      where: { shop: { id: shopId }, is_archived: false },
      select: ['id'],
    });

    return this.fifoService.getAssetValue(items.map(item => item.id));
  }
}
