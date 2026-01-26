export class CreateIssueDto {
  itemId: number;
  fromStoreId?: number;
  fromShopId?: number;
  toStoreId?: number;
  toShopId?: number;
  quantity: number;
  notes?: string;
}
