import { mapTiles } from '@hostels/shared';
import { useMemo, useRef } from 'react';
import { Linking, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

// The package types default the extra props to `undefined`, which makes every prop `never`; `object` adds none.
type MapWebView = WebView<object>;
import { MAP_ATTRIBUTION, MAP_TILE_URL, WEB_URL } from '@/lib/config';
import { type LeafletPage, leafletHtml, mapMessage } from '@/lib/leafletMap';
import { theme } from '@/lib/theme';

const TILES = mapTiles(MAP_TILE_URL, MAP_ATTRIBUTION);

/**
 * A Leaflet map in a WebView (free tiles, no Google Maps key). Links in the map's credits open in the browser; the
 * map itself never navigates away. `setPin` moves the picker's pin from outside (e.g. "Use my location").
 */
export function LeafletView({
  page,
  style,
  label,
  onOpen,
  onPin,
  pinRef,
}: {
  page: Omit<LeafletPage, 'tiles' | 'colors'>;
  style: ViewStyle;
  label: string;
  onOpen?: (slug: string) => void;
  onPin?: (lat: number, lng: number) => void;
  pinRef?: React.MutableRefObject<((lat: number, lng: number) => void) | null>;
}) {
  const web = useRef<MapWebView>(null);
  // Built once per set of pins: re-rendering the page would reset the owner's zoom while they place the pin.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the picker's own moves are not a reason to reload
  const html = useMemo(() => leafletHtml({ ...page, tiles: TILES, colors: { verified: theme.colors.brand, other: theme.colors.food } }), [page.picker ? 'picker' : JSON.stringify(page.pins)]);
  if (pinRef) pinRef.current = (lat, lng) => web.current?.injectJavaScript(`window.setPin && window.setPin(${Number(lat)}, ${Number(lng)}); true;`);
  return (
    <WebView<object>
      ref={web}
      accessibilityLabel={label}
      style={[{ borderRadius: theme.radius.md, overflow: 'hidden' }, style]}
      originWhitelist={['*']}
      // A real origin, so tile servers see where requests come from (OpenStreetMap's tile policy asks for it).
      source={{ html, baseUrl: WEB_URL }}
      onMessage={(e: WebViewMessageEvent) => {
        const m = mapMessage(e.nativeEvent.data);
        if (m?.type === 'open') onOpen?.(m.slug);
        if (m?.type === 'pin') onPin?.(m.lat, m.lng);
      }}
      onShouldStartLoadWithRequest={(req: WebViewNavigation) => {
        // The map page itself loads under the website's address; anything else (the map credits) opens in the browser.
        if (req.url === 'about:blank' || req.url.startsWith(WEB_URL)) return true;
        Linking.openURL(req.url);
        return false;
      }}
      setSupportMultipleWindows={false}
      nestedScrollEnabled
    />
  );
}
