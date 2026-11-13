import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'hostels.session';
let cached: string | null | undefined;

// SecureStore has no web implementation; the web build (used for smoke tests) falls back to localStorage.
const web = Platform.OS === 'web';

export async function getToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    cached = web ? globalThis.localStorage?.getItem(KEY) ?? null : await SecureStore.getItemAsync(KEY);
  } catch {
    cached = null;
  }
  return cached;
}

export async function setToken(token: string | null) {
  cached = token;
  if (web) {
    if (token) globalThis.localStorage?.setItem(KEY, token);
    else globalThis.localStorage?.removeItem(KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(KEY, token);
  else await SecureStore.deleteItemAsync(KEY);
}
