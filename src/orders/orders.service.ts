import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from '../order-items/entities/order-item.entity';
import { Item } from '../items/entities/item.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sale-items/entities/sale-item.entity';
import { Shop } from '../shops/entities/shop.entity';
import { FilterDto } from '../common/filter.dto';
import { paginateWithFilters } from '../common/pagination.util';
import { FifoService } from '../stock-lots/fifo.service';
import { StockAllocation } from '../stock-lots/entities/stock-allocation.entity';
import { assertItemBelongsToShop, assertShopAccess, canAccessShopRecord, shopScopeWhere, stampOwnership, tenantWhere } from '../common/access.util';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Item)
    private itemRepository: Repository<Item>,
    @InjectRepository(Shop)
    private shopRepository: Repository<Shop>,
    @InjectRepository(Sale)
    private salesRepository: Repository<Sale>,
    @InjectRepository(SaleItem)
    private saleItemRepository: Repository<SaleItem>,
    private fifoService: FifoService,
    private dataSource: DataSource,
  ) {}

  async create(createOrderDto: CreateOrderDto): Promise<Order> {
    if (!createOrderDto.items || createOrderDto.items.length === 0) {
      throw new BadRequestException('Order must have at least one item');
    }
    const shopId = createOrderDto.shopId;
    if (!shopId) {
      throw new BadRequestException('Shop is required');
    }

    return this.dataSource.transaction(async (em) => {
      const itemRepo = em.getRepository(Item);
      const shopRepo = em.getRepository(Shop);
      const orderRepo = em.getRepository(Order);
      const orderItemRepo = em.getRepository(OrderItem);

      const order = orderRepo.create({
        status: createOrderDto.status || OrderStatus.PENDING,
        totalAmount: 0,
      });
      stampOwnership(order);

      assertShopAccess(shopId);
      const shop = await shopRepo.findOne({
        where: tenantWhere({ id: shopId }),
      });
      if (shop) {
        order.shop = shop;
      }

      const savedOrder = await orderRepo.save(order);
      let totalAmount = 0;

      for (const orderItemDto of createOrderDto.items) {
        const item = await itemRepo.findOne({
          where: tenantWhere({ id: orderItemDto.itemId, is_archived: false }),
          relations: ['shop'],
        });
        if (!item) {
          throw new BadRequestException(`Item with ID ${orderItemDto.itemId} not found`);
        }
        assertItemBelongsToShop(item, shopId);
        if (orderItemDto.quantity <= 0) {
          throw new BadRequestException(`Order quantity must be greater than 0 for item ${item.name || item.id}`);
        }

        const orderItem = await orderItemRepo.save(orderItemRepo.create({
          order: savedOrder,
          item,
          quantity: orderItemDto.quantity,
          returnedQuantity: 0,
          amount: orderItemDto.amount,
        }));

        await this.fifoService.consume(em, item, orderItemDto.quantity, { orderItem });
        totalAmount += Number(orderItemDto.amount);
      }

      savedOrder.totalAmount = parseFloat(totalAmount.toFixed(2));
      await orderRepo.save(savedOrder);

      const result = await orderRepo.findOne({
        where: { id: savedOrder.id, is_archived: false },
        relations: ['orderItems', 'orderItems.item', 'shop'],
      });
      if (!result) {
        throw new BadRequestException('Failed to reload order after creation');
      }
      return result;
    });
  }

  async findAll(filterDto?: FilterDto, shopId?: number) {
    const baseWhere: any = { ...tenantWhere({ is_archived: false }), ...shopScopeWhere(shopId) };
    if (filterDto && (filterDto.page || filterDto.limit || filterDto.date || filterDto.dateFrom || filterDto.dateTo)) {
      return paginateWithFilters(
        this.ordersRepository,
        filterDto,
        baseWhere,
        ['orderItems', 'orderItems.item', 'shop'],
        { dateField: 'createdAt' }
      );
    }
    return this.ordersRepository.find({
      where: baseWhere,
      relations: ['orderItems', 'orderItems.item', 'shop'],
    });
  }

  async findOne(id: number): Promise<Order | null> {
    const order = await this.ordersRepository.findOne({
      where: tenantWhere({ id, is_archived: false }),
      relations: ['orderItems', 'orderItems.item', 'shop'],
    });
    if (!order || !canAccessShopRecord(order.shop?.id)) {
      return null;
    }
    return order;
  }

  async update(id: number, updateOrderDto: UpdateOrderDto): Promise<Order | null> {
    return this.dataSource.transaction(async (em) => {
      const orderRepo = em.getRepository(Order);
      const orderItemRepo = em.getRepository(OrderItem);
      const itemRepo = em.getRepository(Item);

      const existingOrder = await orderRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['orderItems', 'orderItems.item', 'shop'],
      });

      if (!existingOrder || !canAccessShopRecord(existingOrder.shop?.id)) {
        return null;
      }

      if (updateOrderDto.items !== undefined) {
        if (existingOrder.status === OrderStatus.COMPLETED) {
          throw new BadRequestException('Cannot change items on a completed order');
        }
        if (updateOrderDto.items.length === 0) {
          throw new BadRequestException('Order must have at least one item');
        }

        for (const existingOrderItem of existingOrder.orderItems) {
          await this.fifoService.restoreByOrderItem(em, existingOrderItem.id);
        }
        await orderItemRepo.delete({ order: { id } });

        let totalAmount = 0;
        for (const orderItemDto of updateOrderDto.items) {
          const item = await itemRepo.findOne({
            where: tenantWhere({ id: orderItemDto.itemId, is_archived: false }),
            relations: ['shop'],
          });
          if (!item) {
            throw new BadRequestException(`Item with ID ${orderItemDto.itemId} not found`);
          }
          if (existingOrder.shop?.id) {
            assertItemBelongsToShop(item, existingOrder.shop.id);
          }
          if (orderItemDto.quantity <= 0) {
            throw new BadRequestException(`Order quantity must be greater than 0 for item ${item.name || item.id}`);
          }

          const returnedQty = orderItemDto.returnedQuantity || 0;
          if (returnedQty > orderItemDto.quantity) {
            throw new BadRequestException(
              `Returned quantity (${returnedQty}) cannot exceed issued quantity (${orderItemDto.quantity}) for item ${item.name || item.id}`,
            );
          }

          const orderItem = await orderItemRepo.save(orderItemRepo.create({
            order: existingOrder,
            item,
            quantity: orderItemDto.quantity,
            returnedQuantity: 0,
            amount: orderItemDto.amount,
          }));

          await this.fifoService.consume(em, item, orderItemDto.quantity, { orderItem });
          if (returnedQty > 0) {
            await this.fifoService.restoreByOrderItem(em, orderItem.id, returnedQty);
            orderItem.returnedQuantity = returnedQty;
            await orderItemRepo.save(orderItem);
          }

          totalAmount += Number(orderItemDto.amount);
        }

        existingOrder.totalAmount = parseFloat(totalAmount.toFixed(2));
        await orderRepo.save(existingOrder);
      }

      if (updateOrderDto.status !== undefined && updateOrderDto.status !== existingOrder.status) {
        if (updateOrderDto.status === OrderStatus.COMPLETED) {
          const latest = await orderRepo.findOne({
            where: { id, is_archived: false },
            relations: ['orderItems', 'orderItems.item', 'shop'],
          });
          if (latest) {
            await this.createSaleFromOrder(latest, em);
          }
        }
        existingOrder.status = updateOrderDto.status;
        await orderRepo.save(existingOrder);
      }

      return orderRepo.findOne({
        where: { id, is_archived: false },
        relations: ['orderItems', 'orderItems.item', 'shop'],
      });
    });
  }

  async returnItems(orderId: number, itemId: number, returnedQuantity: number): Promise<Order | null> {
    return this.dataSource.transaction(async (em) => {
      const orderRepo = em.getRepository(Order);
      const orderItemRepo = em.getRepository(OrderItem);

      const order = await orderRepo.findOne({
        where: tenantWhere({ id: orderId, is_archived: false }),
        relations: ['orderItems', 'orderItems.item', 'shop'],
      });

      if (!order || !canAccessShopRecord(order.shop?.id)) {
        return null;
      }
      if (order.status === OrderStatus.COMPLETED) {
        throw new BadRequestException('Cannot return items on a completed order');
      }

      const orderItem = order.orderItems.find(oi => oi.item.id === itemId);
      if (!orderItem) {
        throw new BadRequestException(`Item ${itemId} not found in order ${orderId}`);
      }

      const currentReturned = orderItem.returnedQuantity || 0;
      const newReturnedQuantity = currentReturned + returnedQuantity;

      if (returnedQuantity <= 0) {
        throw new BadRequestException('Returned quantity must be greater than 0');
      }
      if (newReturnedQuantity > orderItem.quantity) {
        throw new BadRequestException(
          `Cannot return more than issued quantity. Issued: ${orderItem.quantity}, Already returned: ${currentReturned}, Trying to return: ${returnedQuantity}`,
        );
      }

      await this.fifoService.restoreByOrderItem(em, orderItem.id, returnedQuantity);
      orderItem.returnedQuantity = newReturnedQuantity;
      await orderItemRepo.save(orderItem);

      return orderRepo.findOne({
        where: { id: orderId, is_archived: false },
        relations: ['orderItems', 'orderItems.item', 'shop'],
      });
    });
  }

  async createSaleFromOrder(order: Order, manager?: EntityManager): Promise<Sale> {
    const run = async (em: EntityManager) => {
      const orderRepo = em.getRepository(Order);
      const saleRepo = em.getRepository(Sale);
      const saleItemRepo = em.getRepository(SaleItem);
      const allocRepo = em.getRepository(StockAllocation);

      const fullOrder = await orderRepo.findOne({
        where: { id: order.id, is_archived: false },
        relations: ['orderItems', 'orderItems.item', 'shop'],
      });

      if (!fullOrder) {
        throw new BadRequestException('Order not found');
      }
      if (!fullOrder.orderItems || fullOrder.orderItems.length === 0) {
        throw new BadRequestException('Cannot create sale from order with no items');
      }

      const existingSale = await saleRepo.findOne({
        where: { order: { id: fullOrder.id }, is_archived: false },
      });
      if (existingSale) {
        throw new BadRequestException('A sale already exists for this order');
      }

      let totalAmount = 0;
      let totalProfit = 0;
      const saleLines: { item: Item; quantity: number; amount: number; profit: number }[] = [];

      for (const orderItem of fullOrder.orderItems) {
        const soldQuantity = orderItem.quantity - (orderItem.returnedQuantity || 0);
        if (soldQuantity <= 0) {
          continue;
        }

        const allocations = await allocRepo.find({
          where: { orderItem: { id: orderItem.id }, is_archived: false },
        });
        let cogs = allocations.reduce(
          (sum, allocation) => sum + allocation.quantity * Number(allocation.unitCost),
          0,
        );
        if (allocations.length === 0) {
          const purchasePrice = Number(orderItem.item.purchasePrice) || 0;
          cogs = purchasePrice * soldQuantity;
        }
        const saleAmount = Number(orderItem.amount) * (soldQuantity / orderItem.quantity);
        const saleProfit = parseFloat((saleAmount - cogs).toFixed(2));

        saleLines.push({
          item: orderItem.item,
          quantity: soldQuantity,
          amount: parseFloat(saleAmount.toFixed(2)),
          profit: saleProfit,
        });
        totalAmount += saleAmount;
        totalProfit += saleProfit;
      }

      if (saleLines.length === 0) {
        throw new BadRequestException('Cannot create sale: all items were returned');
      }

      const sale = saleRepo.create({
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        totalProfit: parseFloat(totalProfit.toFixed(2)),
        shop: fullOrder.shop || null,
        order: fullOrder,
      });
      stampOwnership(sale);
      await saleRepo.save(sale);

      for (const line of saleLines) {
        await saleItemRepo.save(saleItemRepo.create({
          sale,
          item: line.item,
          quantity: line.quantity,
          amount: line.amount,
          profit: line.profit,
        }));
      }

      const result = await saleRepo.findOne({
        where: { id: sale.id, is_archived: false },
        relations: ['saleItems', 'saleItems.item', 'shop'],
      });
      if (!result) {
        throw new BadRequestException('Failed to reload sale after creation');
      }
      return result;
    };

    if (manager) {
      return run(manager);
    }
    return this.dataSource.transaction(run);
  }

  async remove(id: number): Promise<boolean> {
    return this.dataSource.transaction(async (em) => {
      const orderRepo = em.getRepository(Order);
      const saleRepo = em.getRepository(Sale);

      const order = await orderRepo.findOne({
        where: tenantWhere({ id, is_archived: false }),
        relations: ['orderItems', 'orderItems.item', 'shop'],
      });

      if (!order || !canAccessShopRecord(order.shop?.id)) {
        return false;
      }

      const linkedSale = await saleRepo.findOne({
        where: { order: { id: order.id }, is_archived: false },
      });
      if (linkedSale) {
        linkedSale.is_archived = true;
        await saleRepo.save(linkedSale);
      }

      for (const orderItem of order.orderItems) {
        await this.fifoService.restoreByOrderItem(em, orderItem.id);
      }

      order.is_archived = true;
      await orderRepo.save(order);
      return true;
    });
  }
}
