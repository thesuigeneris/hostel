import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type {
  AuthOtpRequestInput,
  AuthOtpVerifyInput,
  AuthSession,
  Hostel,
  SubscribeInput,
  Subscription,
  User,
} from './legacy-types';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:4000';

const TOKEN_KEY = 'hostels:token';
let cachedToken: string | null = null;

async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  const t = await AsyncStorage.getItem(TOKEN_KEY);
  cachedToken = t;
  return t;
}

async function setToken(token: string | null) {
  cachedToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export const api = {
  hostels: {
    list: (filters?: { area?: string; maxRent?: number }) => {
      const q = new URLSearchParams();
      if (filters?.area) q.set('area', filters.area);
      if (filters?.maxRent) q.set('maxRent', String(filters.maxRent));
      const qs = q.toString();
      return request<Hostel[]>(`/hostels${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => request<Hostel>(`/hostels/${id}`),
  },
  auth: {
    requestOtp: (input: AuthOtpRequestInput) =>
      request<{ ok: true; devOtp: string }>('/auth/otp', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    verify: async (input: AuthOtpVerifyInput) => {
      const session = await request<AuthSession>('/auth/verify', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await setToken(session.token);
      return session;
    },
    signOut: () => setToken(null),
    isSignedIn: async () => !!(await getToken()),
  },
  me: {
    get: () => request<User>('/me'),
    update: (input: Partial<User>) =>
      request<User>('/me', { method: 'PATCH', body: JSON.stringify(input) }),
    subscription: () => request<Subscription | null>('/me/subscription'),
  },
  subscribe: (input: SubscribeInput) =>
    request<Subscription>('/subscribe', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  cancelSubscription: (id: string) =>
    request<Subscription>(`/subscriptions/${id}/cancel`, { method: 'POST' }),
};
