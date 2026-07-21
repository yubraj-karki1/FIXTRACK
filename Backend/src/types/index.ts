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
  // Bumped on password reset/change, role change, and MFA disable so any session token
  // issued before that point fails verification immediately (see jwt-verification.service.ts).
  // Not a secret - intentionally left out of the private-field stripping helpers.
  sessionVersion?: number;
  // References an UploadRecord id; the actual file is only reachable through the
  // authenticated /api/uploads/:id streaming route, never by a direct filesystem path.
  avatarUploadId?: string;
  // Joined at read time from avatarUploadId (not stored) so callers get a ready-to-use path.
  avatarUrl?: string;
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
  // Set once a real file has been uploaded through POST /api/complaints/:id/image.
  // `image` keeps rendering the same value the frontend has always used - either this
  // record's streaming URL, or the legacy default/HTTPS URL for complaints without an upload.
  imageUploadId?: string;
  imageCaption?: string;
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
  | 'complaint.note_added'
  | 'upload.succeeded'
  | 'upload.rejected';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  message: string;
  actorId?: string;
  actorName: string;
  actorRole?: UserRole;
  targetId?: string;
  createdAt: string;
  // Structured detail for events that need more than a human-readable message - currently
  // only upload events, which must record IP, size, and MIME type (see upload.service.ts).
  metadata?: Record<string, string | number>;
}

export type UploadResourceType = 'profile' | 'complaint';

/**
 * Metadata for a file that has passed the full validation/scan/re-encode pipeline and been
 * written to private storage. The bytes are only ever reachable through GET /api/uploads/:id,
 * which loads this record to authorize the request - there is no public path to the file.
 */
export interface UploadRecord {
  id: string;
  ownerUserId: string;
  resourceType: UploadResourceType;
  resourceId: string;
  storedFilename: string;
  mimeType: AllowedUploadMimeType;
  sizeBytes: number;
  width: number;
  height: number;
  caption?: string;
  createdAt: string;
}

export type AllowedUploadMimeType = 'image/jpeg' | 'image/webp';

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
  requiresPasswordChange?: boolean;
  userId?: string;
}
