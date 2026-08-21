import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { StockLot } from './entities/stock-lot.entity';
import { StockAllocation } from './entities/stock-allocation.entity';
import { Item } from '../items/entities/item.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { SaleItem } from '../sale-items/entities/sale-item.entity';
import { OrderItem } from '../order-items/entities/order-item.entity';

export interface ConsumeLink {
  saleItem?: SaleItem | null;
  orderItem?: OrderItem | null;
}

@Injectable()
export class FifoService {
  constructor(
    @InjectRepository(StockLot)
    private lotRepository: Repository<StockLot>,
  ) {}

  async ensureLots(em: EntityManager, item: Item): Promise<void> {
    const lotRepo = em.getRepository(StockLot);
    const existing = await lotRepo.count({
      where: { item: { id: item.id }, is_archived: false },
    });
    if (existing > 0) {
      return;
    }

    const qty = item.quantity || 0;
    if (qty <= 0) {
      return;
    }

    const lot = lotRepo.create({
      item,
      originalQuantity: qty,
      remainingQuantity: qty,
      unitCost: Number(item.purchasePrice) || 0,
      receivedAt: new Date('2000-01-01T00:00:00.000Z'),
    });
    await lotRepo.save(lot);
  }

  async refreshItem(em: EntityManager, itemId: number): Promise<Item> {
    const itemRepo = em.getRepository(Item);
    const lotRepo = em.getRepository(StockLot);
    const item = await itemRepo.findOne({ where: { id: itemId } });
    if (!item) {
      throw new BadRequestException(`Item ${itemId} not found`);
    }

    const lots = await lotRepo.find({
      where: { item: { id: itemId }, is_archived: false },
      order: { receivedAt: 'ASC', id: 'ASC' },
    });
    const remainingLots = lots.filter(lot => lot.remainingQuantity > 0);
    item.quantity = remainingLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
    if (remainingLots.length > 0) {
      item.purchasePrice = Number(remainingLots[0].unitCost);
    }
    return itemRepo.save(item);
  }

  async addStock(
    em: EntityManager,
    item: Item,
    quantity: number,
    unitCost: number,
    receivedAt?: Date,
    purchase?: Purchase | null,
  ): Promise<StockLot> {
    if (quantity <= 0) {
      throw new BadRequestException('Stock quantity must be greater than 0');
    }

    await this.ensureLots(em, item);
    const lotRepo = em.getRepository(StockLot);
    const lot = lotRepo.create({
      item,
      originalQuantity: quantity,
      remainingQuantity: quantity,
      unitCost: Number(unitCost) || 0,
      receivedAt: receivedAt || new Date(),
      purchase: purchase || null,
    });
    await lotRepo.save(lot);
    await this.refreshItem(em, item.id);
    return lot;
  }

  async consume(
    em: EntityManager,
    item: Item,
    quantity: number,
    link: ConsumeLink = {},
  ): Promise<{ cogs: number }> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity to consume must be greater than 0');
    }

    await this.ensureLots(em, item);
    const lotRepo = em.getRepository(StockLot);
    const allocRepo = em.getRepository(StockAllocation);

    const lots = await lotRepo
      .createQueryBuilder('lot')
      .setLock('pessimistic_write')
      .where('lot.item_id = :itemId', { itemId: item.id })
      .andWhere('lot.is_archived = :archived', { archived: false })
      .andWhere('lot.remainingQuantity > 0')
      .orderBy('lot.receivedAt', 'ASC')
      .addOrderBy('lot.id', 'ASC')
      .getMany();

    let remaining = quantity;
    let cogs = 0;

    for (const lot of lots) {
      if (remaining <= 0) {
        break;
      }
      const take = Math.min(lot.remainingQuantity, remaining);
      lot.remainingQuantity -= take;
      await lotRepo.save(lot);

      const allocation = allocRepo.create({
        lot,
        quantity: take,
        unitCost: Number(lot.unitCost),
        saleItem: link.saleItem || null,
        orderItem: link.orderItem || null,
      });
      await allocRepo.save(allocation);

      cogs += take * Number(lot.unitCost);
      remaining -= take;
    }

    if (remaining > 0) {
      throw new BadRequestException(
        `Insufficient quantity for item ${item.name || item.id}. Available: ${quantity - remaining}, Requested: ${quantity}`,
      );
    }

    await this.refreshItem(em, item.id);
    return { cogs: parseFloat(cogs.toFixed(2)) };
  }

  async restoreBySaleItem(em: EntityManager, saleItemId: number): Promise<void> {
    const allocRepo = em.getRepository(StockAllocation);
    const allocations = await allocRepo.find({
      where: { saleItem: { id: saleItemId }, is_archived: false },
      relations: ['lot', 'lot.item'],
    });
    if (allocations.length === 0) {
      await this.restoreLegacyLine(em, 'saleItem', saleItemId);
      return;
    }
    await this.restoreAllocations(em, allocations);
  }

  async restoreByOrderItem(em: EntityManager, orderItemId: number, quantity?: number): Promise<void> {
    const allocRepo = em.getRepository(StockAllocation);
    const allocations = await allocRepo.find({
      where: { orderItem: { id: orderItemId }, is_archived: false },
      relations: ['lot', 'lot.item'],
      order: { id: 'DESC' },
    });

    if (allocations.length === 0) {
      await this.restoreLegacyLine(em, 'orderItem', orderItemId, quantity);
      return;
    }

    if (quantity === undefined) {
      await this.restoreAllocations(em, allocations);
      return;
    }

    let remaining = quantity;
    const lotRepo = em.getRepository(StockLot);
    const itemIds = new Set<number>();

    for (const allocation of allocations) {
      if (remaining <= 0) {
        break;
      }
      const take = Math.min(allocation.quantity, remaining);
      allocation.lot.remainingQuantity += take;
      await lotRepo.save(allocation.lot);
      if (allocation.lot.item?.id) {
        itemIds.add(allocation.lot.item.id);
      }

      allocation.quantity -= take;
      if (allocation.quantity <= 0) {
        allocation.is_archived = true;
      }
      await allocRepo.save(allocation);
      remaining -= take;
    }

    if (remaining > 0) {
      throw new BadRequestException('Cannot return more stock than was issued from FIFO lots');
    }

    for (const itemId of itemIds) {
      await this.refreshItem(em, itemId);
    }
  }

  async transferLots(
    em: EntityManager,
    sourceItem: Item,
    destinationItem: Item,
    quantity: number,
  ): Promise<void> {
    if (quantity <= 0) {
      throw new BadRequestException('Transfer quantity must be greater than 0');
    }

    await this.ensureLots(em, sourceItem);
    const lotRepo = em.getRepository(StockLot);

    const lots = await lotRepo
      .createQueryBuilder('lot')
      .setLock('pessimistic_write')
      .where('lot.item_id = :itemId', { itemId: sourceItem.id })
      .andWhere('lot.is_archived = :archived', { archived: false })
      .andWhere('lot.remainingQuantity > 0')
      .orderBy('lot.receivedAt', 'ASC')
      .addOrderBy('lot.id', 'ASC')
      .getMany();

    let remaining = quantity;
    for (const lot of lots) {
      if (remaining <= 0) {
        break;
      }
      const take = Math.min(lot.remainingQuantity, remaining);
      lot.remainingQuantity -= take;
      await lotRepo.save(lot);

      const movedLot = lotRepo.create({
        item: destinationItem,
        originalQuantity: take,
        remainingQuantity: take,
        unitCost: Number(lot.unitCost),
        receivedAt: lot.receivedAt,
        purchase: lot.purchase || null,
      });
      await lotRepo.save(movedLot);
      remaining -= take;
    }

    if (remaining > 0) {
      throw new BadRequestException(
        `Cannot transfer ${quantity} units. Only ${quantity - remaining} units available.`,
      );
    }

    await this.refreshItem(em, sourceItem.id);
    await this.refreshItem(em, destinationItem.id);
  }

  async removePurchaseStock(em: EntityManager, purchaseId: number): Promise<void> {
    const lotRepo = em.getRepository(StockLot);
    const lot = await lotRepo.findOne({
      where: { purchase: { id: purchaseId }, is_archived: false },
      relations: ['item'],
    });
    if (!lot) {
      return;
    }

    if (lot.remainingQuantity !== lot.originalQuantity) {
      throw new BadRequestException(
        'Cannot delete this purchase because some of its FIFO stock has already been sold or transferred',
      );
    }

    lot.remainingQuantity = 0;
    lot.is_archived = true;
    await lotRepo.save(lot);
    await this.refreshItem(em, lot.item.id);
  }

  async adjustPurchaseQuantity(
    em: EntityManager,
    purchaseId: number,
    newQuantity: number,
  ): Promise<void> {
    if (newQuantity <= 0) {
      throw new BadRequestException('Purchase quantity must be greater than 0');
    }

    const lotRepo = em.getRepository(StockLot);
    const lot = await lotRepo.findOne({
      where: { purchase: { id: purchaseId }, is_archived: false },
      relations: ['item'],
    });
    if (!lot) {
      return;
    }

    const consumed = lot.originalQuantity - lot.remainingQuantity;
    if (newQuantity < consumed) {
      throw new BadRequestException(
        `Cannot reduce purchase quantity below ${consumed}; that much stock has already been used`,
      );
    }

    const delta = newQuantity - lot.originalQuantity;
    lot.originalQuantity = newQuantity;
    lot.remainingQuantity += delta;
    await lotRepo.save(lot);
    await this.refreshItem(em, lot.item.id);
  }

  async adjustPurchaseCost(em: EntityManager, purchaseId: number, unitCost: number): Promise<void> {
    const lotRepo = em.getRepository(StockLot);
    const lot = await lotRepo.findOne({
      where: { purchase: { id: purchaseId }, is_archived: false },
      relations: ['item'],
    });
    if (!lot) {
      return;
    }
    lot.unitCost = Number(unitCost) || 0;
    await lotRepo.save(lot);
    await this.refreshItem(em, lot.item.id);
  }

  async getRemainingLots(itemId: number): Promise<StockLot[]> {
    return this.lotRepository.find({
      where: { item: { id: itemId }, is_archived: false },
      order: { receivedAt: 'ASC', id: 'ASC' },
    });
  }

  async getAssetValue(itemIds: number[]): Promise<number> {
    if (!itemIds.length) {
      return 0;
    }

    const result = await this.lotRepository
      .createQueryBuilder('lot')
      .select('COALESCE(SUM(lot.remainingQuantity * lot.unitCost), 0)', 'total')
      .where('lot.item_id IN (:...itemIds)', { itemIds })
      .andWhere('lot.is_archived = :archived', { archived: false })
      .getRawOne();

    return parseFloat(result?.total || '0') || 0;
  }

  private async restoreLegacyLine(
    em: EntityManager,
    kind: 'saleItem' | 'orderItem',
    lineId: number,
    quantity?: number,
  ): Promise<void> {
    if (kind === 'saleItem') {
      const saleItem = await em.getRepository(SaleItem).findOne({
        where: { id: lineId },
        relations: ['item'],
      });
      if (!saleItem?.item || !saleItem.quantity) {
        return;
      }
      await this.addStock(
        em,
        saleItem.item,
        saleItem.quantity,
        Number(saleItem.item.purchasePrice) || 0,
        new Date('2000-01-01T00:00:00.000Z'),
      );
      return;
    }

    const orderItem = await em.getRepository(OrderItem).findOne({
      where: { id: lineId },
      relations: ['item'],
    });
    if (!orderItem?.item) {
      return;
    }
    const qty = quantity ?? (orderItem.quantity - (orderItem.returnedQuantity || 0));
    if (qty <= 0) {
      return;
    }
    await this.addStock(
      em,
      orderItem.item,
      qty,
      Number(orderItem.item.purchasePrice) || 0,
      new Date('2000-01-01T00:00:00.000Z'),
    );
  }

  private async restoreAllocations(em: EntityManager, allocations: StockAllocation[]): Promise<void> {
    const lotRepo = em.getRepository(StockLot);
    const allocRepo = em.getRepository(StockAllocation);
    const itemIds = new Set<number>();

    for (const allocation of allocations) {
      allocation.lot.remainingQuantity += allocation.quantity;
      await lotRepo.save(allocation.lot);
      allocation.is_archived = true;
      await allocRepo.save(allocation);
      if (allocation.lot.item?.id) {
        itemIds.add(allocation.lot.item.id);
      }
    }

    for (const itemId of itemIds) {
      await this.refreshItem(em, itemId);
    }
  }
}
