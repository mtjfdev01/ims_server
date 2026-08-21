import { DataSource } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { StockLot } from './entities/stock-lot.entity';

export async function backfillStockLots(dataSource: DataSource): Promise<void> {
  const itemRepository = dataSource.getRepository(Item);
  const lotRepository = dataSource.getRepository(StockLot);

  const items = await itemRepository.find({
    where: { is_archived: false },
  });

  let created = 0;
  for (const item of items) {
    const existing = await lotRepository.count({
      where: { item: { id: item.id }, is_archived: false },
    });
    if (existing > 0 || !item.quantity || item.quantity <= 0) {
      continue;
    }

    const lot = lotRepository.create({
      item,
      originalQuantity: item.quantity,
      remainingQuantity: item.quantity,
      unitCost: Number(item.purchasePrice) || 0,
      receivedAt: new Date('2000-01-01T00:00:00.000Z'),
    });
    await lotRepository.save(lot);
    created += 1;
  }

  if (created > 0) {
    console.log(`FIFO backfill created ${created} opening stock lot(s)`);
  }
}
