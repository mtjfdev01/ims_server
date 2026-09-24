import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Seller } from './entities/seller.entity';
import { CreateSellerDto } from './dto/create-seller.dto';
import { UpdateSellerDto } from './dto/update-seller.dto';
import { Shop } from '../shops/entities/shop.entity';
import { FilterDto } from '../common/filter.dto';
import { paginateQuery } from '../common/pagination.util';
import { applyShopOrUnscoped, applyTenantScope, assertShopAccess, canAccessOptionalShopRecord, canAccessShopRecord, skipsShopFilter, stampOwnership, tenantWhere } from '../common/access.util';

@Injectable()
export class SellersService {
  constructor(
    @InjectRepository(Seller)
    private sellersRepository: Repository<Seller>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
  ) {}

  async create(dto: CreateSellerDto): Promise<Seller> {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Seller name is required');
    }
    const seller = this.sellersRepository.create({
      name: dto.name.trim(),
      phone: dto.phone?.trim() || null,
      email: dto.email?.trim() || null,
      address: dto.address?.trim() || null,
      notes: dto.notes?.trim() || null,
      cnic: dto.cnic?.trim() || null,
    });
    stampOwnership(seller);

    const shopId = dto.shopId;
    if (!skipsShopFilter() && !shopId) {
      throw new BadRequestException('Shop is required');
    }
    if (shopId) {
      assertShopAccess(shopId);
      const shop = await this.shopRepository.findOne({ where: tenantWhere({ id: shopId }) });
      if (!shop) {
        throw new BadRequestException('Shop not found');
      }
      seller.shop = shop;
    }

    return this.sellersRepository.save(seller);
  }

  async resolveForShop(
    shopId: number | undefined,
    sellerId?: number,
    newSeller?: { name: string; phone?: string; cnic?: string },
    em?: EntityManager,
  ): Promise<Seller | null> {
    const sellerRepo = em ? em.getRepository(Seller) : this.sellersRepository;
    const shopRepo = em ? em.getRepository(Shop) : this.shopRepository;
    if (newSeller?.name?.trim()) {
      const created = sellerRepo.create({
        name: newSeller.name.trim(),
        phone: newSeller.phone?.trim() || null,
        cnic: newSeller.cnic?.trim() || null,
      });
      stampOwnership(created);
      if (shopId) {
        const shop = await shopRepo.findOne({ where: tenantWhere({ id: shopId }) });
        if (!shop) {
          throw new BadRequestException('Shop not found');
        }
        created.shop = shop;
      }
      return sellerRepo.save(created);
    }
    if (!sellerId) {
      return null;
    }
    const seller = await sellerRepo.findOne({
      where: tenantWhere({ id: sellerId, is_archived: false }),
      relations: ['shop'],
    });
    if (!seller) {
      throw new BadRequestException('Seller not found');
    }
    if (shopId && seller.shop?.id && Number(seller.shop.id) !== Number(shopId)) {
      throw new BadRequestException('Seller does not belong to this shop');
    }
    if (seller.shop?.id && !canAccessOptionalShopRecord(seller.shop.id)) {
      throw new BadRequestException('Seller not found');
    }
    return seller;
  }

  async findAll(filterDto?: FilterDto | string, shopId?: number) {
    const search = typeof filterDto === 'string' ? filterDto : filterDto?.search;
    const queryBuilder = this.sellersRepository.createQueryBuilder('seller')
      .leftJoinAndSelect('seller.shop', 'shop')
      .where('seller.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'seller');
    if (shopId) {
      assertShopAccess(shopId);
      queryBuilder.andWhere('(seller.shop_id = :shopId OR seller.shop_id IS NULL)', { shopId });
    } else {
      applyShopOrUnscoped(queryBuilder, 'seller');
    }
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      queryBuilder.andWhere(
        '(seller.name ILIKE :term OR seller.phone ILIKE :term OR seller.email ILIKE :term OR seller.address ILIKE :term OR seller.cnic ILIKE :term)',
        { term },
      );
    }
    if (typeof filterDto === 'object' && filterDto?.date) {
      queryBuilder.andWhere('DATE(seller.createdAt) = DATE(:date)', { date: filterDto.date });
    } else if (typeof filterDto === 'object') {
      if (filterDto?.dateFrom) {
        queryBuilder.andWhere('DATE(seller.createdAt) >= DATE(:dateFrom)', { dateFrom: filterDto.dateFrom });
      }
      if (filterDto?.dateTo) {
        queryBuilder.andWhere('DATE(seller.createdAt) <= DATE(:dateTo)', { dateTo: filterDto.dateTo });
      }
    }
    queryBuilder.orderBy('seller.name', 'ASC');
    return paginateQuery(queryBuilder, typeof filterDto === 'object' ? filterDto : undefined);
  }

  async findOne(id: number): Promise<Seller | null> {
    const seller = await this.sellersRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['shop', 'purchases', 'purchases.shop', 'purchases.item'],
    });
    if (!seller) {
      return null;
    }
    if (seller.shop?.id && !canAccessOptionalShopRecord(seller.shop.id)) {
      return null;
    }
    if (seller.purchases) {
      seller.purchases = seller.purchases
        .filter(purchase => !purchase.is_archived && canAccessShopRecord(purchase.shop?.id))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return seller;
  }

  private async loadForWrite(id: number): Promise<Seller | null> {
    const seller = await this.sellersRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['shop'],
    });
    if (!seller) {
      return null;
    }
    if (seller.shop?.id && !canAccessOptionalShopRecord(seller.shop.id)) {
      return null;
    }
    return seller;
  }

  async update(id: number, dto: UpdateSellerDto): Promise<Seller | null> {
    const seller = await this.loadForWrite(id);
    if (!seller) {
      return null;
    }
    if (dto.name !== undefined) {
      if (!dto.name.trim()) {
        throw new BadRequestException('Seller name is required');
      }
      seller.name = dto.name.trim();
    }
    if (dto.phone !== undefined) {
      seller.phone = dto.phone?.trim() || null;
    }
    if (dto.email !== undefined) {
      seller.email = dto.email?.trim() || null;
    }
    if (dto.address !== undefined) {
      seller.address = dto.address?.trim() || null;
    }
    if (dto.notes !== undefined) {
      seller.notes = dto.notes?.trim() || null;
    }
    if (dto.cnic !== undefined) {
      seller.cnic = dto.cnic?.trim() || null;
    }
    if (dto.shopId !== undefined) {
      if (dto.shopId) {
        assertShopAccess(dto.shopId);
        const shop = await this.shopRepository.findOne({ where: tenantWhere({ id: dto.shopId }) });
        if (!shop) {
          throw new BadRequestException('Shop not found');
        }
        seller.shop = shop;
      } else if (skipsShopFilter()) {
        seller.shop = null;
      } else {
        throw new BadRequestException('Shop is required');
      }
    }
    await this.sellersRepository.save(seller);
    return this.findOne(id);
  }

  async remove(id: number): Promise<boolean> {
    const seller = await this.loadForWrite(id);
    if (!seller) {
      return false;
    }
    seller.is_archived = true;
    await this.sellersRepository.save(seller);
    return true;
  }
}
