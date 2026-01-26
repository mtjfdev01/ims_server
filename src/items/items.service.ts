import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item } from './entities/item.entity';
import { Company } from '../companies/entities/company.entity';
import { Category } from '../category/entities/category.entity';
import { Store } from '../stores/entities/store.entity';
import { Shop } from '../shops/entities/shop.entity';
import { PurchasesService } from '../purchases/purchases.service';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private itemsRepository: Repository<Item>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Store)
    private storeRepository: Repository<Store>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
    @Inject(forwardRef(() => PurchasesService))
    private purchasesService: PurchasesService,
  ) {}

  async create(createItemDto: CreateItemDto): Promise<Item> {
    // Validate required fields
    if (!createItemDto.name || !createItemDto.name.trim()) {
      throw new Error('Item name is required');
    }
    if (!createItemDto.company || typeof createItemDto.company !== 'number') {
      throw new Error('Company is required and must be a valid ID');
    }

    const item = this.itemsRepository.create({
      name: createItemDto.name.trim(),
      location: createItemDto.location,
      quantity: createItemDto.quantity || 1,
      purchasePrice: createItemDto.purchasePrice,
      minimumSalePrice: createItemDto.minimumSalePrice,
    });

    // Set company relationship
    const company = await this.companyRepository.findOne({
      where: { id: createItemDto.company },
    });
    if (!company) {
      throw new Error(`Company with ID ${createItemDto.company} not found`);
    }
    item.company = company;

    // Set categories relationship
    if (createItemDto.categories && createItemDto.categories.length > 0) {
      const categories = await this.categoryRepository.findBy({
        id: In(createItemDto.categories),
      });
      item.categories = categories;
    }

    // Set store relationship (optional)
    if (createItemDto.storeId) {
      const store = await this.storeRepository.findOne({
        where: { id: createItemDto.storeId },
      });
      if (store) {
        item.store = store;
      }
    }

    // Set shop relationship (optional)
    if (createItemDto.shopId) {
      const shop = await this.shopRepository.findOne({
        where: { id: createItemDto.shopId },
      });
      if (shop) {
        item.shop = shop;
      }
    }

    const savedItem = await this.itemsRepository.save(item);

    // Create purchase record automatically when item is created
    if (createItemDto.purchasePrice) {
      try {
        await this.purchasesService.create({
          itemId: savedItem.id,
          purchasePrice: createItemDto.purchasePrice,
          quantity: createItemDto.quantity || 1,
          purchaseDate: new Date().toISOString().split('T')[0],
        });
      } catch (error) {
        console.error('Error creating purchase record:', error);
        // Don't fail item creation if purchase creation fails
      }
    }

    return savedItem;
  }

  findAll(filterType?: 'store' | 'shop', search?: string): Promise<Item[]> {
    const queryBuilder = this.itemsRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.company', 'company')
      .leftJoinAndSelect('item.categories', 'categories')
      .leftJoinAndSelect('item.store', 'store')
      .leftJoinAndSelect('item.shop', 'shop')
      .where('item.is_archived = :archived', { archived: false });

    let hasWhere = true;

    if (filterType === 'store') {
      queryBuilder.andWhere('item.store_id IS NOT NULL');
    } else if (filterType === 'shop') {
      queryBuilder.andWhere('item.shop_id IS NOT NULL');
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      queryBuilder.andWhere('item.name ILIKE :search', { search: searchTerm });
    }

    return queryBuilder.getMany();
  }

  findOne(id: number): Promise<Item | null> {
    return this.itemsRepository.findOne({
      where: { id, is_archived: false },
      relations: ['company', 'categories', 'store', 'shop'],
    });
  }

  async update(id: number, updateItemDto: UpdateItemDto): Promise<Item | null> {
    const item = await this.itemsRepository.findOne({
      where: { id, is_archived: false },
      relations: ['company', 'categories', 'store', 'shop'],
    });

    if (!item) {
      return null;
    }

    // Update basic fields
    if (updateItemDto.name !== undefined) {
      item.name = updateItemDto.name;
    }
    if (updateItemDto.location !== undefined) {
      item.location = updateItemDto.location;
    }
    if (updateItemDto.quantity !== undefined) {
      item.quantity = updateItemDto.quantity;
    }
    if (updateItemDto.purchasePrice !== undefined) {
      item.purchasePrice = updateItemDto.purchasePrice;
    }
    if (updateItemDto.minimumSalePrice !== undefined) {
      item.minimumSalePrice = updateItemDto.minimumSalePrice;
    }

    // Update company relationship
    if (updateItemDto.company !== undefined) {
      const company = await this.companyRepository.findOne({
        where: { id: updateItemDto.company },
      });
      if (company) {
        item.company = company;
      }
    }

    // Update categories relationship
    if (updateItemDto.categories !== undefined) {
      if (updateItemDto.categories.length > 0) {
        const categories = await this.categoryRepository.findBy({
          id: In(updateItemDto.categories),
        });
        item.categories = categories;
      } else {
        item.categories = [];
      }
    }

    // Update store relationship
    if (updateItemDto.storeId !== undefined) {
      if (updateItemDto.storeId) {
        const store = await this.storeRepository.findOne({
          where: { id: updateItemDto.storeId },
        });
        item.store = store ?? null;
        // If assigning to store, remove from shop
        item.shop = null;
      } else {
        item.store = null;
      }
    }

    // Update shop relationship
    if (updateItemDto.shopId !== undefined) {
      if (updateItemDto.shopId) {
        const shop = await this.shopRepository.findOne({
          where: { id: updateItemDto.shopId },
        });
        item.shop = shop ?? null;
        // If assigning to shop, remove from store
        item.store = null;
      } else {
        item.shop = null;
      }
    }

    return this.itemsRepository.save(item);
  }

  async remove(id: number): Promise<boolean> {
    const item = await this.itemsRepository.findOne({
      where: { id, is_archived: false },
    });

    if (!item) {
      return false;
    }

    // Soft delete: mark as archived instead of deleting
    item.is_archived = true;
    await this.itemsRepository.save(item);
    return true;
  }

  findByStore(storeId: number): Promise<Item[]> {
    return this.itemsRepository.find({
      where: { store: { id: storeId }, is_archived: false },
      relations: ['company', 'categories', 'store', 'shop'],
    });
  }

  findByShop(shopId: number): Promise<Item[]> {
    return this.itemsRepository.find({
      where: { shop: { id: shopId }, is_archived: false },
      relations: ['company', 'categories', 'store', 'shop'],
    });
  }

  findAllShopItems(): Promise<Item[]> {
    const queryBuilder = this.itemsRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.company', 'company')
      .leftJoinAndSelect('item.categories', 'categories')
      .leftJoinAndSelect('item.store', 'store')
      .leftJoinAndSelect('item.shop', 'shop')
      .where('item.shop_id IS NOT NULL')
      .andWhere('item.is_archived = :archived', { archived: false });
    return queryBuilder.getMany();
  }

  async transfer(transferDto: {
    itemId: number;
    quantity: number;
    fromStoreId?: number;
    fromShopId?: number;
    toStoreId?: number;
    toShopId?: number;
    notes?: string;
  }): Promise<{ sourceItem: Item; destinationItem: Item }> {
    const sourceItem = await this.itemsRepository.findOne({
      where: { id: transferDto.itemId, is_archived: false },
      relations: ['store', 'shop', 'company', 'categories'],
    });

    if (!sourceItem) {
      throw new Error('Item not found');
    }

    // Validate quantity
    const transferQuantity = transferDto.quantity || 1;
    if (transferQuantity <= 0) {
      throw new Error('Transfer quantity must be greater than 0');
    }
    if (transferQuantity > sourceItem.quantity) {
      throw new Error(`Cannot transfer ${transferQuantity} units. Only ${sourceItem.quantity} units available.`);
    }

    // Verify item is in the source location
    if (transferDto.fromStoreId) {
      if (!sourceItem.store || sourceItem.store.id !== transferDto.fromStoreId) {
        throw new Error('Item is not in the specified store');
      }
    } else if (transferDto.fromShopId) {
      if (!sourceItem.shop || sourceItem.shop.id !== transferDto.fromShopId) {
        throw new Error('Item is not in the specified shop');
      }
    } else {
      throw new Error('Source location must be specified');
    }

    // Get destination
    let destinationStore: Store | null = null;
    let destinationShop: Shop | null = null;

    if (transferDto.toStoreId) {
      destinationStore = await this.storeRepository.findOne({
        where: { id: transferDto.toStoreId },
      });
      if (!destinationStore) {
        throw new Error('Destination store not found');
      }
    } else if (transferDto.toShopId) {
      destinationShop = await this.shopRepository.findOne({
        where: { id: transferDto.toShopId },
      });
      if (!destinationShop) {
        throw new Error('Destination shop not found');
      }
    } else {
      throw new Error('Destination location must be specified');
    }

    // Check if same item exists in destination (same company, same categories)
    const categoryIds = sourceItem.categories?.map(c => c.id) || [];
    let destinationItem: Item | null = null;
    
    if (destinationStore) {
      destinationItem = await this.itemsRepository.findOne({
        where: {
          company: { id: sourceItem.company.id },
          store: { id: destinationStore.id },
          is_archived: false,
        },
        relations: ['company', 'categories', 'store', 'shop'],
      });
    } else if (destinationShop) {
      destinationItem = await this.itemsRepository.findOne({
        where: {
          company: { id: sourceItem.company.id },
          shop: { id: destinationShop.id },
          is_archived: false,
        },
        relations: ['company', 'categories', 'store', 'shop'],
      });
    }

    // If item exists in destination, check if categories match
    if (destinationItem) {
      const destCategoryIds = destinationItem.categories?.map(c => c.id).sort() || [];
      const sourceCategoryIds = categoryIds.sort();
      const categoriesMatch = 
        destCategoryIds.length === sourceCategoryIds.length &&
        destCategoryIds.every((id, idx) => id === sourceCategoryIds[idx]);

      if (!categoriesMatch) {
        destinationItem = null; // Categories don't match, create new item
      }
    }

    // Reduce quantity from source item
    sourceItem.quantity = sourceItem.quantity - transferQuantity;
    if (sourceItem.quantity === 0) {
      // If quantity becomes 0, remove from source location
      sourceItem.store = null;
      sourceItem.shop = null;
    }

    // Add quantity to destination
    if (destinationItem) {
      // Item exists in destination, increase quantity
      destinationItem.quantity = destinationItem.quantity + transferQuantity;
      await this.itemsRepository.save(destinationItem);
    } else {
      // Item doesn't exist in destination, create new item
      const newItem = this.itemsRepository.create({
        name: sourceItem.name,
        company: sourceItem.company,
        categories: sourceItem.categories,
        store: destinationStore,
        shop: destinationShop,
        location: sourceItem.location,
        quantity: transferQuantity,
        purchasePrice: sourceItem.purchasePrice,
        minimumSalePrice: sourceItem.minimumSalePrice,
      });
      destinationItem = await this.itemsRepository.save(newItem);
    }

    // Save source item
    await this.itemsRepository.save(sourceItem);

    return { sourceItem, destinationItem };
  }

  async removeAll(): Promise<number> {
    // Soft delete: mark all items as archived
    const result = await this.itemsRepository.update({ is_archived: false }, { is_archived: true });
    return result.affected || 0;
  }
}
