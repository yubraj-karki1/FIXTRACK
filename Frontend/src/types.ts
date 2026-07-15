import type { Dispatch, SetStateAction } from 'react';
import type { LucideIcon } from 'lucide-react';

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
  photo?: string;
  totpEnabled?: boolean;
}

export interface AuthLoginResponse {
  user: User | null;
  requiresTotp: boolean;
  userId?: string;
}

export interface TotpSetupResponse {
  userId: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface Complaint {
  id: string;
  title: string;
  category: ComplaintCategoryName;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  building: string;
  room: string;
  studentUserId: string;
  student: string;
  studentPhone?: string;
  staffUserId?: string;
  staff: string;
  submitted: string;
  description: string;
  image: string;
  notes: string[];
  updates: ComplaintStatus[];
}

export type AuditEventType =
  | 'user.registered'
  | 'user.privileged_created'
  | 'user.login_success'
  | 'user.login_failed'
  | 'user.account_locked'
  | 'user.role_changed'
  | 'user.status_changed'
  | 'complaint.created'
  | 'complaint.status_changed'
  | 'complaint.assigned'
  | 'complaint.note_added';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  message: string;
  actorId?: string;
  actorName: string;
  actorRole?: UserRole;
  targetId?: string;
  createdAt: string;
}

export interface ComplaintCategory {
  name: ComplaintCategoryName;
  color: string;
}

export interface IconCategory extends ComplaintCategory {
  icon: LucideIcon;
}

export interface ChartDatum {
  name: string;
  value: number;
}

export interface ToastApi {
  notify: (message: string) => void;
}

export interface FixTrackContextValue extends ToastApi {
  complaints: Complaint[];
  setComplaints: Dispatch<SetStateAction<Complaint[]>>;
  currentUser: User;
  setCurrentUser: Dispatch<SetStateAction<User>>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  inactivityWarningVisible: boolean;
  // Session state is derived from the server-verified HttpOnly cookie, not local storage.
  authStatus: 'loading' | 'authenticated' | 'unauthenticated';
  refreshAuth: () => Promise<User | null>;
  logout: () => Promise<void>;
}
