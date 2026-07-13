import type { AuthLoginResponse, TotpSetupResponse, User } from '@/types';

// Empty uses Next's same-origin API rewrite; a configured value supports a separate backend host.
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

interface ApiResponse<T> {
  data: T;
  message?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      // Required for cross-origin development and harmless for same-origin rewrites.
      // The browser attaches HttpOnly cookies without exposing the JWT to JavaScript.
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers
      }
    });
  } catch {
    throw new Error('Backend is not running. Start it with: cd backend; npm run dev');
  }

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload;
}

export const api = {
  // Use the same browser-visible API origin for Google and password authentication.
  googleLoginUrl: `${apiBaseUrl}/api/auth/google`,

  async login(email: string, password: string): Promise<AuthLoginResponse> {
    // The backend writes the session cookie; this response never includes a JWT.
    const payload = await request<AuthLoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
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
      body: JSON.stringify({ ...input, role: 'Student' })
    });
    return payload.data;
  },

  async getCurrentUser(): Promise<User> {
    // This is the only frontend source of truth for the currently authenticated user.
    const payload = await request<User>('/api/auth/me', {
      method: 'GET',
      cache: 'no-store'
    });
    return payload.data;
  },

  async logout(): Promise<void> {
    // Only the backend can expire an HttpOnly cookie correctly.
    await request<null>('/api/auth/logout', { method: 'POST' });
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
    return payload.data;
  },

  async disableTotp(userId: string): Promise<User> {
    const payload = await request<User>('/api/auth/totp/disable', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
    return payload.data;
  }
};
