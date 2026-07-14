import type { ComplaintCategoryName, ComplaintPriority, ComplaintStatus } from '../types/index.js';

export interface CreateComplaintDto {
  title: string;
  category: ComplaintCategoryName;
  priority: ComplaintPriority;
  building: string;
  room: string;
  description: string;
  image?: string;
}

export interface UpdateComplaintDto {
  title?: string;
  category?: ComplaintCategoryName;
  priority?: ComplaintPriority;
  status?: ComplaintStatus;
  building?: string;
  room?: string;
  description?: string;
  image?: string;
  staffUserId?: string;
  note?: string;
}
