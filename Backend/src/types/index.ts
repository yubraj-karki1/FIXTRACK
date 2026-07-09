export type UserRole = 'Student' | 'Maintenance Staff' | 'Administrator';
export type AccountStatus = 'Active' | 'Inactive';
export type ComplaintStatus = 'Pending' | 'Assigned' | 'In Progress' | 'Resolved' | 'Closed';
export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Emergency';
export type ComplaintCategoryName =
  | 'Water'
  | 'Electricity'
  | 'Wi-Fi'
  | 'Bathroom'
  | 'Door/Lock'
  | 'Furniture'
  | 'Cleaning'
  | 'Other';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  phone: string;
  building: string;
  room: string;
  status: AccountStatus;
  studentId?: string;
  password?: string;
  totpSecret?: string;
  pendingTotpSecret?: string;
  totpEnabled?: boolean;
}

export interface Complaint {
  id: string;
  title: string;
  category: ComplaintCategoryName;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  building: string;
  room: string;
  student: string;
  staff: string;
  submitted: string;
  description: string;
  image: string;
  notes: string[];
  updates: ComplaintStatus[];
}

export interface ComplaintUpdate {
  id: string;
  complaintId: string;
  status: ComplaintStatus;
  note: string;
  createdAt: string;
  createdBy: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface HealthResponse {
  status: 'ok';
  service: string;
}

export interface TotpSetupResponse {
  userId: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface AuthLoginResponse {
  user: User | null;
  requiresTotp: boolean;
  userId?: string;
}
