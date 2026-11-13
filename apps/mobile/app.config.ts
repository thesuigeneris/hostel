import type { ConfigContext, ExpoConfig } from 'expo/config';

// Per-build settings layered on app.json. The EAS profiles in eas.json set these env vars;
// locally they come from your shell. EXPO_PUBLIC_* are also inlined into the JS bundle (lib/config.ts).
const variant = process.env.APP_VARIANT ?? 'development';
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000';
const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

// Plain http (an API on your laptop's LAN address) is only allowed in non-production builds.
const cleartext = variant !== 'production' && (apiUrl.startsWith('http://') || webUrl.startsWith('http://'));

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: variant === 'production' ? 'Hostels' : `Hostels (${variant})`,
  slug: config.slug ?? 'hostels',
  extra: { ...config.extra, apiUrl, webUrl, variant },
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-maps', mapsKey ? { androidGoogleMapsApiKey: mapsKey } : {}],
    ['expo-build-properties', { android: { usesCleartextTraffic: cleartext } }],
  ],
});
