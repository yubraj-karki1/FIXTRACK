import type { ComplaintCategoryName } from '../types/index.js';

export interface ComplaintCategory {
  id: string;
  name: ComplaintCategoryName;
  description: string;
}
