import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
  ) {}

  async create(createOrderDto: CreateOrderDto): Promise<Order> {
    if (!createOrderDto.items || createOrderDto.items.length === 0) {
      throw new Error('Order must have at least one item');
    }

    // Validate all items and quantities before processing
    const itemValidations = await Promise.all(
      createOrderDto.items.map(async (orderItemDto) => {
        const item = await this.itemRepository.findOne({
          where: { id: orderItemDto.itemId, is_archived: false },
        });

        if (!item) {
          throw new Error(`Item with ID ${orderItemDto.itemId} not found`);
        }

        if (orderItemDto.quantity <= 0) {
          throw new Error(`Order quantity must be greater than 0 for item ${item.name || item.id}`);
        }

        if (item.quantity < orderItemDto.quantity) {
          throw new Error(
            `Insufficient quantity for item ${item.name || item.id}. Available: ${item.quantity}, Requested: ${orderItemDto.quantity}`
          );
        }

        return { item, orderItemDto };
      })
    );

    // Calculate total amount
    let totalAmount = 0;

    // Create order
    const order = this.ordersRepository.create({
      status: createOrderDto.status || OrderStatus.PENDING,
      totalAmount: 0,
    });

    const savedOrder = await this.ordersRepository.save(order);

    // Create order items and update item quantities
    for (const { item, orderItemDto } of itemValidations) {
      // Create order item
      const orderItem = this.orderItemRepository.create({
        order: savedOrder,
        item: item,
        quantity: orderItemDto.quantity,
        returnedQuantity: 0,
        amount: orderItemDto.amount,
      });

      await this.orderItemRepository.save(orderItem);

      // Subtract item quantity (items issued for project)
      item.quantity = item.quantity - orderItemDto.quantity;
      await this.itemRepository.save(item);

      // Accumulate total
      totalAmount += orderItemDto.amount;
    }

    // Update order with total
    savedOrder.totalAmount = totalAmount;
    await this.ordersRepository.save(savedOrder);

    // Reload with relations
    const result = await this.ordersRepository.findOne({
      where: { id: savedOrder.id, is_archived: false },
      relations: ['orderItems', 'orderItems.item'],
    });
    if (!result) {
      throw new Error('Failed to reload order after creation');
    }
    return result;
  }

  async findAll(filterDto?: FilterDto, shopId?: number) {
    const baseWhere: any = { is_archived: false };
    if (shopId) {
      baseWhere.shop = { id: shopId };
    }
    if (filterDto && (filterDto.page || filterDto.limit || filterDto.date || filterDto.dateFrom || filterDto.dateTo)) {
      return paginateWithFilters(
        this.ordersRepository,
        filterDto,
        baseWhere,
        ['orderItems', 'orderItems.item'],
        { dateField: 'createdAt' }
      );
    }
    return this.ordersRepository.find({
      where: baseWhere,
      relations: ['orderItems', 'orderItems.item'],
    });
  }

  findOne(id: number): Promise<Order | null> {
    return this.ordersRepository.findOne({
      where: { id, is_archived: false },
      relations: ['orderItems', 'orderItems.item'],
    });
  }

  async update(id: number, updateOrderDto: UpdateOrderDto): Promise<Order | null> {
    const existingOrder = await this.ordersRepository.findOne({
      where: { id, is_archived: false },
      relations: ['orderItems', 'orderItems.item'],
    });

    if (!existingOrder) {
      return null;
    }

    // Handle status change to COMPLETED - create sale automatically
    if (updateOrderDto.status === OrderStatus.COMPLETED && existingOrder.status !== OrderStatus.COMPLETED) {
      await this.createSaleFromOrder(existingOrder);
    }

    // Handle items update
    if (updateOrderDto.items !== undefined) {
      if (updateOrderDto.items.length === 0) {
        throw new Error('Order must have at least one item');
      }

      // Create a map of existing order items by itemId to preserve returnedQuantity and track what to restore
      const existingItemsMap = new Map<number, { returnedQty: number; quantity: number }>();
      for (const existingOrderItem of existingOrder.orderItems) {
        existingItemsMap.set(existingOrderItem.item.id, {
          returnedQty: existingOrderItem.returnedQuantity || 0,
          quantity: existingOrderItem.quantity
        });
      }

      // Restore quantities from existing order items (only net issued quantities)
      for (const existingOrderItem of existingOrder.orderItems) {
        const item = await this.itemRepository.findOne({
          where: { id: existingOrderItem.item.id, is_archived: false },
        });
        if (item) {
          // Restore the net issued quantity (quantity - returnedQuantity)
          const netIssuedQuantity = existingOrderItem.quantity - (existingOrderItem.returnedQuantity || 0);
          item.quantity = item.quantity + netIssuedQuantity;
          await this.itemRepository.save(item);
        }
      }

      // Delete existing order items
      await this.orderItemRepository.delete({ order: { id } });

      // Validate new items and quantities
      const itemValidations = await Promise.all(
        updateOrderDto.items.map(async (orderItemDto) => {
          const item = await this.itemRepository.findOne({
            where: { id: orderItemDto.itemId, is_archived: false },
          });

          if (!item) {
            throw new Error(`Item with ID ${orderItemDto.itemId} not found`);
          }

          if (orderItemDto.quantity <= 0) {
            throw new Error(`Order quantity must be greater than 0 for item ${item.name || item.id}`);
          }

          // Determine returned quantity (preserve existing or use provided)
          const existingItemData = existingItemsMap.get(orderItemDto.itemId);
          const preservedReturnedQty = existingItemData?.returnedQty || 0;
          const returnedQty = orderItemDto.returnedQuantity !== undefined 
            ? orderItemDto.returnedQuantity 
            : preservedReturnedQty;

          // Validate returned quantity doesn't exceed issued quantity
          if (returnedQty > orderItemDto.quantity) {
            throw new Error(`Returned quantity (${returnedQty}) cannot exceed issued quantity (${orderItemDto.quantity}) for item ${item.name || item.id}`);
          }

          // Check if we have enough for net issued quantity (quantity - returnedQuantity)
          const netIssuedQty = orderItemDto.quantity - returnedQty;
          if (item.quantity < netIssuedQty) {
            throw new Error(
              `Insufficient quantity for item ${item.name || item.id}. Available: ${item.quantity}, Net issued needed: ${netIssuedQty} (${orderItemDto.quantity} issued - ${returnedQty} returned)`
            );
          }

          return { item, orderItemDto };
        })
      );

      // Create new order items and update quantities
      let totalAmount = 0;

      for (const { item, orderItemDto } of itemValidations) {
        // Preserve returnedQuantity if this item existed before, otherwise use provided value or 0
        const existingItemData = existingItemsMap.get(orderItemDto.itemId);
        const preservedReturnedQty = existingItemData?.returnedQty || 0;
        const returnedQty = orderItemDto.returnedQuantity !== undefined 
          ? orderItemDto.returnedQuantity 
          : preservedReturnedQty;

        const orderItem = this.orderItemRepository.create({
          order: existingOrder,
          item: item,
          quantity: orderItemDto.quantity,
          returnedQuantity: returnedQty,
          amount: orderItemDto.amount,
        });

        await this.orderItemRepository.save(orderItem);

        // Subtract the new net issued quantity (quantity - returnedQuantity)
        // Note: We already restored the old net issued quantity above, so we just subtract the new one
        const newNetIssued = orderItemDto.quantity - returnedQty;
        item.quantity = item.quantity - newNetIssued;
        await this.itemRepository.save(item);

        totalAmount += orderItemDto.amount;
      }

      // Update order total
      existingOrder.totalAmount = totalAmount;
      await this.ordersRepository.save(existingOrder);
    }

    // Update status if provided
    if (updateOrderDto.status !== undefined) {
      existingOrder.status = updateOrderDto.status;
      await this.ordersRepository.save(existingOrder);
    }

    return this.findOne(id);
  }

  async returnItems(orderId: number, itemId: number, returnedQuantity: number): Promise<Order | null> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId, is_archived: false },
      relations: ['orderItems', 'orderItems.item'],
    });

    if (!order) {
      return null;
    }

    const orderItem = order.orderItems.find(oi => oi.item.id === itemId);
    if (!orderItem) {
      throw new Error(`Item ${itemId} not found in order ${orderId}`);
    }

    const currentReturned = orderItem.returnedQuantity || 0;
    const newReturnedQuantity = currentReturned + returnedQuantity;

    if (newReturnedQuantity > orderItem.quantity) {
      throw new Error(`Cannot return more than issued quantity. Issued: ${orderItem.quantity}, Already returned: ${currentReturned}, Trying to return: ${returnedQuantity}`);
    }

    // Update returned quantity
    orderItem.returnedQuantity = newReturnedQuantity;
    await this.orderItemRepository.save(orderItem);

    // Add returned quantity back to item
    const item = await this.itemRepository.findOne({
      where: { id: itemId, is_archived: false },
    });

    if (item) {
      item.quantity = item.quantity + returnedQuantity;
      await this.itemRepository.save(item);
    }

    return this.findOne(orderId);
  }

  async createSaleFromOrder(order: Order): Promise<Sale> {
    if (!order.orderItems || order.orderItems.length === 0) {
      throw new Error('Cannot create sale from order with no items');
    }

    // Reload order with item relations
    const fullOrder = await this.ordersRepository.findOne({
      where: { id: order.id, is_archived: false },
      relations: ['orderItems', 'orderItems.item'],
    });

    if (!fullOrder) {
      throw new Error('Order not found');
    }

    // Calculate sale items (only non-returned quantities)
    interface SaleItemData {
      itemId: number;
      quantity: number;
      amount: number;
      profit: number;
      item: Item;
    }
    const saleItems: SaleItemData[] = [];
    let totalAmount = 0;
    let totalProfit = 0;

    for (const orderItem of fullOrder.orderItems) {
      const soldQuantity = orderItem.quantity - (orderItem.returnedQuantity || 0);
      
      if (soldQuantity > 0) {
        const purchasePrice = typeof orderItem.item.purchasePrice === 'string' 
          ? parseFloat(orderItem.item.purchasePrice) 
          : (orderItem.item.purchasePrice || 0);
        
        // Calculate proportional amount based on sold quantity
        const saleAmount = orderItem.amount * (soldQuantity / orderItem.quantity);
        const saleProfit = saleAmount - (purchasePrice * soldQuantity);

        saleItems.push({
          itemId: orderItem.item.id,
          quantity: soldQuantity,
          amount: saleAmount,
          profit: saleProfit,
          item: orderItem.item,
        });

        totalAmount += saleAmount;
        totalProfit += saleProfit;
      }
    }

    if (saleItems.length === 0) {
      throw new Error('Cannot create sale: all items were returned');
    }

    // Create sale
    const sale = this.salesRepository.create({
      totalAmount,
      totalProfit,
    });

    const savedSale = await this.salesRepository.save(sale);

    // Create sale items (DO NOT subtract quantities - items were already issued when order was created)
    for (const saleItemData of saleItems) {
      const saleItem = this.saleItemRepository.create({
        sale: savedSale,
        item: saleItemData.item,
        quantity: saleItemData.quantity,
        profit: saleItemData.profit,
        amount: saleItemData.amount,
      });

      await this.saleItemRepository.save(saleItem);
    }

    const result = await this.salesRepository.findOne({
      where: { id: savedSale.id, is_archived: false },
      relations: ['saleItems', 'saleItems.item'],
    });
    if (!result) {
      throw new Error('Failed to reload sale after creation');
    }
    return result;
  }

  async remove(id: number): Promise<boolean> {
    const order = await this.ordersRepository.findOne({
      where: { id, is_archived: false },
      relations: ['orderItems', 'orderItems.item'],
    });

    if (!order) {
      return false;
    }

    // Restore quantities for all items (subtract returned quantities as they were already returned)
    for (const orderItem of order.orderItems) {
      const item = await this.itemRepository.findOne({
        where: { id: orderItem.item.id, is_archived: false },
      });
      if (item) {
        // Restore only the net issued quantity (quantity - returnedQuantity)
        const netIssuedQuantity = orderItem.quantity - (orderItem.returnedQuantity || 0);
        item.quantity = item.quantity + netIssuedQuantity;
        await this.itemRepository.save(item);
      }
    }

    // Soft delete: mark as archived instead of deleting
    order.is_archived = true;
    await this.ordersRepository.save(order);
    return true;
  }
}
