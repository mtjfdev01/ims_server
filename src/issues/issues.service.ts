import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { Issue } from './entities/issue.entity';
import { Item } from '../items/entities/item.entity';
import { Store } from '../stores/entities/store.entity';
import { Shop } from '../shops/entities/shop.entity';
import { applyTenantScope, assertShopAccess, assignedShopIds, canAccessIssue, skipsShopFilter, stampOwnership, tenantWhere } from '../common/access.util';

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue)
    private issuesRepository: Repository<Issue>,
    @InjectRepository(Item)
    private itemRepository: Repository<Item>,
    @InjectRepository(Store)
    private storeRepository: Repository<Store>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
  ) {}

  async create(createIssueDto: CreateIssueDto): Promise<Issue> {
    // Verify item exists
    const item = await this.itemRepository.findOne({
      where: tenantWhere({ id: createIssueDto.itemId }),
      relations: ['store', 'shop'],
    });

    if (!item) {
      throw new Error('Item not found');
    }

    // Determine source (store or shop)
    let fromStore: Store | null = null;
    let fromShop: Shop | null = null;

    if (createIssueDto.fromStoreId) {
      fromStore = await this.storeRepository.findOne({
        where: tenantWhere({ id: createIssueDto.fromStoreId, is_archived: false }),
      });
      if (!fromStore) {
        throw new Error('Source store not found');
      }
      if (!item.store || item.store.id !== createIssueDto.fromStoreId) {
        throw new Error('Item is not in the specified store');
      }
    } else if (createIssueDto.fromShopId) {
      assertShopAccess(createIssueDto.fromShopId);
      fromShop = await this.shopRepository.findOne({
        where: tenantWhere({ id: createIssueDto.fromShopId, is_archived: false }),
      });
      if (!fromShop) {
        throw new Error('Source shop not found');
      }
      if (!item.shop || item.shop.id !== createIssueDto.fromShopId) {
        throw new Error('Item is not in the specified shop');
      }
    } else {
      throw new Error('Source (store or shop) must be specified');
    }

    // Determine destination (store or shop)
    let toStore: Store | null = null;
    let toShop: Shop | null = null;

    if (createIssueDto.toStoreId) {
      toStore = await this.storeRepository.findOne({
        where: tenantWhere({ id: createIssueDto.toStoreId, is_archived: false }),
      });
      if (!toStore) {
        throw new Error('Destination store not found');
      }
    } else if (createIssueDto.toShopId) {
      assertShopAccess(createIssueDto.toShopId);
      toShop = await this.shopRepository.findOne({
        where: tenantWhere({ id: createIssueDto.toShopId, is_archived: false }),
      });
      if (!toShop) {
        throw new Error('Destination shop not found');
      }
    } else {
      throw new Error('Destination (store or shop) must be specified');
    }

    // Create the issue record
    const issue = this.issuesRepository.create({
      item: item,
      fromStore: fromStore,
      fromShop: fromShop,
      toStore: toStore,
      toShop: toShop,
      quantity: createIssueDto.quantity,
      notes: createIssueDto.notes,
      issuedDate: new Date(),
    });
    stampOwnership(issue);

    const savedIssue = await this.issuesRepository.save(issue);

    // Move item to destination
    item.store = toStore;
    item.shop = toShop;
    await this.itemRepository.save(item);

    return savedIssue;
  }

  findAll(): Promise<Issue[]> {
    const queryBuilder = this.issuesRepository.createQueryBuilder('issue')
      .leftJoinAndSelect('issue.item', 'item')
      .leftJoinAndSelect('issue.fromStore', 'fromStore')
      .leftJoinAndSelect('issue.fromShop', 'fromShop')
      .leftJoinAndSelect('issue.toStore', 'toStore')
      .leftJoinAndSelect('issue.toShop', 'toShop')
      .where('issue.is_archived = :archived', { archived: false });
    applyTenantScope(queryBuilder, 'issue');
    if (!skipsShopFilter()) {
      const ids = assignedShopIds()?.length ? assignedShopIds() as number[] : [-1];
      queryBuilder.andWhere(
        '(fromShop.id IN (:...shopIds) OR toShop.id IN (:...shopIds) OR (fromShop.id IS NULL AND toShop.id IS NULL))',
        { shopIds: ids },
      );
    }
    return queryBuilder.getMany();
  }

  async findOne(id: number): Promise<Issue | null> {
    const issue = await this.issuesRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['item', 'fromStore', 'fromShop', 'toStore', 'toShop'],
    });
    if (!issue || !canAccessIssue(issue)) {
      return null;
    }
    return issue;
  }

  async update(id: number, updateIssueDto: UpdateIssueDto): Promise<Issue | null> {
    const issue = await this.issuesRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['item', 'fromStore', 'fromShop', 'toStore', 'toShop'],
    });

    if (!issue || !canAccessIssue(issue)) {
      return null;
    }

    if (updateIssueDto.quantity !== undefined) {
      issue.quantity = updateIssueDto.quantity;
    }
    if (updateIssueDto.notes !== undefined) {
      issue.notes = updateIssueDto.notes;
    }

    return this.issuesRepository.save(issue);
  }

  async remove(id: number): Promise<boolean> {
    const issue = await this.issuesRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['fromShop', 'toShop'],
    });

    if (!issue || !canAccessIssue(issue)) {
      return false;
    }

    // Soft delete: mark as archived instead of deleting
    issue.is_archived = true;
    await this.issuesRepository.save(issue);
    return true;
  }
}
