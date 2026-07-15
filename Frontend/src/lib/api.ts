import type {
  AccountStatus,
  AuditEvent,
  AuthLoginResponse,
  Complaint,
  ComplaintCategoryName,
  ComplaintPriority,
  ComplaintStatus,
  TotpSetupResponse,
  User,
  UserRole
} from '@/types';

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
const csrfProtectedMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfToken: string | null = null;

interface ApiResponse<T> {
  data: T;
  message?: string;
  errors?: { field: string; message: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  let response: Response;
  const method = (init?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (csrfProtectedMethods.has(method) && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers
    });
  } catch {
    throw new Error('Backend is not running. Start it with: cd backend; npm run dev');
  }

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok) {
    // Field-level messages (e.g. "Description must be between 10 and 2000 characters.")
    // are far more actionable than the generic "Validation failed" summary alone.
    const detail = payload.errors?.map((fieldError) => fieldError.message).join(' ');
    throw new Error(detail || payload.message || 'Request failed');
  }

  return payload;
}

export const api = {
  async login(email: string, password: string): Promise<AuthLoginResponse> {
    // The backend writes the session cookie; this response never includes a JWT.
    const payload = await request<AuthLoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    csrfToken = null;
    return payload.data;
  },

  async register(input: {
    name: string;
    studentId: string;
    email: string;
    password: string;
    phone: string;
    building: string;
    room: string;
  }): Promise<User> {
    const payload = await request<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    // Registration creates a fresh HttpOnly session; /auth/csrf will mint its companion token.
    csrfToken = null;
    return payload.data;
  },

  async forgotPassword(email: string): Promise<void> {
    await request<null>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    await request<null>('/api/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword })
    });
  },

  async getCurrentUser(): Promise<User> {
    // This is the only frontend source of truth for the currently authenticated user.
    const payload = await request<User>('/api/auth/me', {
      method: 'GET',
      cache: 'no-store'
    });
    return payload.data;
  },

  async getComplaints(): Promise<Complaint[]> {
    const payload = await request<Complaint[]>('/api/complaints', { method: 'GET', cache: 'no-store' });
    return payload.data;
  },

  async createComplaint(input: {
    title: string;
    category: ComplaintCategoryName;
    priority: ComplaintPriority;
    building: string;
    room: string;
    description: string;
    image?: string;
  }): Promise<Complaint> {
    const payload = await request<Complaint>('/api/complaints', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return payload.data;
  },

  async updateComplaint(id: string, input: {
    status?: ComplaintStatus;
    priority?: ComplaintPriority;
    staffUserId?: string;
    note?: string;
  }): Promise<Complaint> {
    const payload = await request<Complaint>(`/api/complaints/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
    return payload.data;
  },

  async getUsers(): Promise<User[]> {
    const payload = await request<User[]>('/api/users', { method: 'GET', cache: 'no-store' });
    return payload.data;
  },

  async getUserById(id: string): Promise<User> {
    const payload = await request<User>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'GET', cache: 'no-store' });
    return payload.data;
  },

  async getAuditLog(limit?: number): Promise<AuditEvent[]> {
    const query = limit ? `?limit=${limit}` : '';
    const payload = await request<AuditEvent[]>(`/api/admin/audit${query}`, { method: 'GET', cache: 'no-store' });
    return payload.data;
  },

  async createPrivilegedUser(input: {
    name: string;
    email: string;
    password: string;
    phone: string;
    role: Exclude<UserRole, 'Student'>;
    building: string;
    room: string;
    studentId?: string;
  }): Promise<User> {
    const payload = await request<User>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return payload.data;
  },

  async updateUser(id: string, input: { role?: UserRole; status?: AccountStatus }): Promise<User> {
    const payload = await request<User>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
    return payload.data;
  },

  async updateProfile(input: { name: string; phone: string; building: string; room: string }): Promise<User> {
    const payload = await request<User>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
    return payload.data;
  },

  async refreshCsrfToken(): Promise<void> {
    // This authenticated, no-store GET response safely transfers a signed CSRF token to memory.
    const payload = await request<{ token: string }>('/api/auth/csrf', {
      method: 'GET',
      cache: 'no-store'
    });
    csrfToken = payload.data.token;
  },

  clearCsrfToken(): void {
    csrfToken = null;
  },

  async logout(): Promise<void> {
    await request<null>('/api/auth/logout', { method: 'POST' });
    csrfToken = null;
  },

  async setupTotp(userId: string): Promise<TotpSetupResponse> {
    const payload = await request<TotpSetupResponse>('/api/auth/totp/setup', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
    return payload.data;
  },

  async verifyTotpSetup(userId: string, token: string): Promise<User> {
    const payload = await request<User>('/api/auth/totp/verify-setup', {
      method: 'POST',
      body: JSON.stringify({ userId, token })
    });
    return payload.data;
  },

  async verifyTotpLogin(userId: string, token: string): Promise<User> {
    // A valid code upgrades the backend's short-lived challenge cookie to a full session cookie.
    const payload = await request<User>('/api/auth/totp/verify-login', {
      method: 'POST',
      body: JSON.stringify({ userId, token })
    });
    csrfToken = null;
    return payload.data;
  },

  async disableTotp(userId: string, token: string): Promise<User> {
    const payload = await request<User>('/api/auth/totp/disable', {
      method: 'POST',
      body: JSON.stringify({ userId, token })
    });
    return payload.data;
  }
};
