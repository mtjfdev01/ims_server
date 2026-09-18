import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { assertShopAccess, requireSuperAdmin, requireTenantId, requireUser, skipsShopFilter, stampOwnership, tenantWhere } from '../common/access.util';
import { UserRole } from '../common/request-context';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { Shop } from './entities/shop.entity';
import { Item } from '../items/entities/item.entity';
import { Store } from '../stores/entities/store.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
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
    private usersService: UsersService,
  ) {}

  async create(createShopDto: CreateShopDto): Promise<Shop> {
    const authUser = requireUser();
    const tenantId = await this.usersService.resolveCreateTenantId(
      createShopDto.tenantId,
      createShopDto.tenantName,
    );
    const shop = this.shopsRepository.create({
      name: createShopDto.name,
      branch: createShopDto.branch,
      dealer: createShopDto.dealer,
      location: createShopDto.location,
    });
    stampOwnership(shop, tenantId);

    if (createShopDto.storeIds && createShopDto.storeIds.length > 0) {
      const stores = await this.storeRepository.find({
        where: tenantWhere({ id: In(createShopDto.storeIds) }),
      });
      shop.stores = stores;
    }

    const saved = await this.shopsRepository.save(shop);
    const user = await this.userRepository.findOne({ where: { id: authUser.id }, relations: ['shops'] });
    if (user && authUser.role === UserRole.USER) {
      user.shops = [...(user.shops || []).filter(existing => existing.id !== saved.id), saved];
      await this.userRepository.save(user);
    }
    return this.shopsRepository.findOne({
      where: { id: saved.id },
      relations: ['stores', 'tenant'],
    }) as Promise<Shop>;
  }

  async findAll(paginationDto?: PaginationDto): Promise<Shop[] | PaginationResult<Shop>> {
    const user = requireUser();
    const queryBuilder = this.shopsRepository.createQueryBuilder('shop')
      .leftJoinAndSelect('shop.stores', 'stores')
      .where('shop.is_archived = :archived', { archived: false });

    const scoped = tenantWhere();
    if (scoped.tenant) {
      queryBuilder.andWhere('shop.tenant_id = :tenantId', { tenantId: scoped.tenant.id });
    }
    if (!skipsShopFilter(user)) {
      const ids = user.shopIds.length ? user.shopIds : [-1];
      queryBuilder.andWhere('shop.id IN (:...ids)', { ids });
    }

    if (paginationDto && (paginationDto.page || paginationDto.limit)) {
      const page = paginationDto.page || 1;
      const limit = paginationDto.limit || 10;
      const skip = (page - 1) * limit;
      const [data, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
    return queryBuilder.getMany();
  }

  async findOne(id: number): Promise<Shop | null> {
    const queryBuilder = this.shopsRepository.createQueryBuilder('shop')
      .leftJoinAndSelect('shop.stores', 'stores')
      .where('shop.id = :id', { id })
      .andWhere('shop.is_archived = :archived', { archived: false });

    const scoped = tenantWhere();
    if (scoped.tenant) {
      queryBuilder.andWhere('shop.tenant_id = :tenantId', { tenantId: scoped.tenant.id });
    }
    const user = requireUser();
    if (user.role !== UserRole.SUPER_ADMIN) {
      assertShopAccess(id);
    }

    return queryBuilder.getOne();
  }

  async update(id: number, updateShopDto: UpdateShopDto): Promise<Shop | null> {
    const shop = await this.shopsRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['stores'],
    });
    if (shop) {
      assertShopAccess(id);
    }

    if (!shop) {
      return null;
    }

    if (updateShopDto.name !== undefined) shop.name = updateShopDto.name;
    if (updateShopDto.branch !== undefined) shop.branch = updateShopDto.branch;
    if (updateShopDto.dealer !== undefined) shop.dealer = updateShopDto.dealer;
    if (updateShopDto.location !== undefined) shop.location = updateShopDto.location;

    if (updateShopDto.storeIds !== undefined) {
      if (updateShopDto.storeIds.length > 0) {
        const stores = await this.storeRepository.find({
          where: tenantWhere({ id: In(updateShopDto.storeIds) }),
        });
        shop.stores = stores;
      } else {
        shop.stores = [];
      }
    }

    return this.shopsRepository.save(shop);
  }

  async remove(id: number): Promise<boolean> {
    requireSuperAdmin();
    const shop = await this.shopsRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
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
    requireSuperAdmin();
    requireTenantId();
    const result = await this.shopsRepository.update(tenantWhere({ is_archived: false }), { is_archived: true });
    return result.affected || 0;
  }

  async getItems(shopId: number): Promise<Item[]> {
    const shop = await this.findOne(shopId);
    if (!shop) {
      throw new NotFoundException('Shop not found or access denied');
    }

    return this.itemRepository.find({
      where: tenantWhere({ shop: { id: shopId }, is_archived: false }),
      relations: ['company', 'categories', 'store', 'shop'],
    });
  }

  async getAssetValue(shopId: number): Promise<number> {
    const shop = await this.findOne(shopId);
    if (!shop) {
      throw new NotFoundException('Shop not found or access denied');
    }

    const items = await this.itemRepository.find({
      where: tenantWhere({ shop: { id: shopId }, is_archived: false }),
      select: ['id'],
    });

    return this.fifoService.getAssetValue(items.map(item => item.id));
  }
}
