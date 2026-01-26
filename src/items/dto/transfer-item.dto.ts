export class TransferItemDto {
  itemId: number;
  quantity: number;
  fromStoreId?: number;
  fromShopId?: number;
  toStoreId?: number;
  toShopId?: number;
  notes?: string;
}
