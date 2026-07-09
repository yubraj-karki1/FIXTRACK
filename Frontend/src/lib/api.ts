import type { AuthLoginResponse, TotpSetupResponse, User } from '@/types';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || '';

interface ApiResponse<T> {
  data: T;
  message?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
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
  async login(email: string, password: string): Promise<AuthLoginResponse> {
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
