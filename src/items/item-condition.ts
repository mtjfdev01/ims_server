export const ITEM_CONDITIONS = [
  'new',
  'used',
  'refurbished',
  'grade_a',
  'grade_b',
  'grade_c',
] as const;

export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export const SECOND_HAND_CONDITIONS: ItemCondition[] = [
  'used',
  'refurbished',
  'grade_a',
  'grade_b',
  'grade_c',
];

export function isItemCondition(value: string): value is ItemCondition {
  return (ITEM_CONDITIONS as readonly string[]).includes(value);
}

export function normalizeUniqueIdentifier(value?: string | null): string | null {
  const next = String(value || '').trim();
  return next || null;
}

export function applyItemConditionFilter(
  queryBuilder: { andWhere: (where: string, params?: Record<string, unknown>) => unknown },
  itemAlias: string,
  condition?: string,
) {
  if (condition === 'second_hand') {
    queryBuilder.andWhere(`${itemAlias}.condition IN (:...secondHand)`, { secondHand: SECOND_HAND_CONDITIONS });
    return;
  }
  if (condition && isItemCondition(condition)) {
    queryBuilder.andWhere(`${itemAlias}.condition = :condition`, { condition });
  }
}
