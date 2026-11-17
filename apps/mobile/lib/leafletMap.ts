import { LEAFLET_CDN, type MapTiles } from '@hostels/shared';

/**
 * The app's maps: Leaflet with free OpenStreetMap tiles (or the configured provider) inside a WebView, the same as the
 * website. No Google Maps SDK, so no API key or billing account. The page talks back with postMessage:
 *   { type: 'open', slug }        a pin's label was tapped (hostel list map)
 *   { type: 'pin', lat, lng }     the owner tapped the map or dragged the pin (pin picker)
 */
export type MapPin = { id: string; lat: number; lng: number; label: string; sub?: string; verified?: boolean; slug?: string };

export type LeafletPage = {
  pins: MapPin[];
  center: { lat: number; lng: number };
  zoom: number;
  tiles: MapTiles;
  colors: { verified: string; other: string };
  /** The owner's pin picker: one draggable pin; taps move it. */
  picker?: boolean;
  /** Fit all pins in view (several hostels). */
  fit?: boolean;
};

/** JSON safe inside a <script> element: no "</script>" or HTML comment can end it early. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function leafletHtml(page: LeafletPage): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="${LEAFLET_CDN.css}" integrity="${LEAFLET_CDN.cssIntegrity}" crossorigin="">
<style>html,body,#map{height:100%;margin:0}.pin{width:28px;height:28px;display:grid;place-items:center}.dot{width:18px;height:18px;border-radius:9999px;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}.open{font:600 14px system-ui;color:#1F5C46;text-decoration:underline;cursor:pointer}</style>
</head><body><div id="map"></div>
<script src="${LEAFLET_CDN.js}" integrity="${LEAFLET_CDN.jsIntegrity}" crossorigin=""></script>
<script>
(function () {
  var P = ${scriptJson(page)};
  var send = function (m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  var map = L.map('map', { zoomControl: true }).setView([P.center.lat, P.center.lng], P.zoom);
  L.tileLayer(P.tiles.url, { attribution: P.tiles.attribution, maxZoom: P.tiles.maxZoom }).addTo(map);
  var icon = function (verified) {
    return L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14],
      html: '<div class="pin"><div class="dot" style="background:' + (verified ? P.colors.verified : P.colors.other) + '"></div></div>' });
  };
  if (P.picker) {
    var p = P.pins[0];
    var marker = L.marker([p.lat, p.lng], { draggable: true, icon: icon(true), title: p.label, alt: p.label }).addTo(map);
    var move = function (ll) { marker.setLatLng(ll); send({ type: 'pin', lat: ll.lat, lng: ll.lng }); };
    marker.on('dragend', function () { move(marker.getLatLng()); });
    map.on('click', function (e) { move(e.latlng); });
    window.setPin = function (lat, lng) { marker.setLatLng([lat, lng]); map.setView([lat, lng], Math.max(map.getZoom(), 16)); };
  } else {
    P.pins.forEach(function (h) {
      var box = document.createElement('div');
      var name = document.createElement('div');
      name.textContent = h.label;
      if (h.slug) { name.className = 'open'; name.onclick = function () { send({ type: 'open', slug: h.slug }); }; }
      box.appendChild(name);
      if (h.sub) { var sub = document.createElement('div'); sub.textContent = h.sub; box.appendChild(sub); }
      L.marker([h.lat, h.lng], { icon: icon(!!h.verified), title: h.label, alt: h.label }).addTo(map).bindPopup(box);
    });
    if (P.fit && P.pins.length > 1) map.fitBounds(L.latLngBounds(P.pins.map(function (h) { return [h.lat, h.lng]; })), { padding: [32, 32] });
  }
})();
</script></body></html>`;
}

/** A message from the map page, checked: anything else is ignored. */
export function mapMessage(raw: string): { type: 'open'; slug: string } | { type: 'pin'; lat: number; lng: number } | null {
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    if (m.type === 'open' && typeof m.slug === 'string' && /^[a-z0-9-]{1,120}$/.test(m.slug)) return { type: 'open', slug: m.slug };
    if (m.type === 'pin' && typeof m.lat === 'number' && typeof m.lng === 'number' && Math.abs(m.lat) <= 90 && Math.abs(m.lng) <= 180) {
      return { type: 'pin', lat: Number(m.lat.toFixed(6)), lng: Number(m.lng.toFixed(6)) };
    }
  } catch {}
  return null;
}
