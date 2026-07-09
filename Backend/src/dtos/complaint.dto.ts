import type { ComplaintCategoryName, ComplaintPriority } from '../types/index.js';

export interface CreateComplaintDto {
  title: string;
  category: ComplaintCategoryName;
  priority: ComplaintPriority;
  building: string;
  room: string;
  description: string;
  image?: string;
}
