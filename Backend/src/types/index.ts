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
  failedLoginAttempts?: number;
  lockedUntil?: string;
  totpSecret?: string;
  pendingTotpSecret?: string;
  totpEnabled?: boolean;
  passwordResetCodeHash?: string;
  passwordResetExpiresAt?: string;
  passwordResetAttempts?: number;
  passwordHistory?: string[];
  passwordChangedAt?: string;
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
  // Joined from the student's live profile when a complaint is returned by the API, not
  // stored on the record itself, so it never goes stale after a phone number change.
  studentPhone?: string;
  staffUserId?: string;
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

export type AuditEventType =
  | 'user.registered'
  | 'user.privileged_created'
  | 'user.login_success'
  | 'user.login_failed'
  | 'user.account_locked'
  | 'user.role_changed'
  | 'user.status_changed'
  | 'user.password_reset_requested'
  | 'user.password_reset_completed'
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

export interface ApiResponse<T> {
  data: T;
  message?: string;
  errors?: Array<{ field: string; message: string }>;
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
