import Constants from 'expo-constants';

type Extra = { apiUrl?: string; webUrl?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** On a physical phone, point these at your laptop's LAN address, e.g. EXPO_PUBLIC_API_URL=http://192.168.1.10:4000. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? 'http://localhost:4000';
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? extra.webUrl ?? 'http://localhost:3000';
