export class CreateItemDto {
  name: string;
  company: number;
  categories: number[];
  storeId?: number;
  shopId?: number;
  location?: string;
  uniqueIdentifier?: string;
  condition?: string;
  quantity: number;
  purchasePrice: number;
  minimumSalePrice: number;
}
