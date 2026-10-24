'use client';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';

export type MapMarker = { id: string; lat: number; lng: number; label: string; href?: string; sublabel?: string };

const pin = (color: string) =>
  L.divIcon({
    className: '',
    html: `<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
const brandPin = pin('#1f5f4a');
const foodPin = pin('#d9822b');

function FitBounds({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length > 1) map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng])), { padding: [30, 30] });
    else if (markers.length === 1) map.setView([markers[0]!.lat, markers[0]!.lng], 15);
  }, [map, markers]);
  return null;
}

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) });
  return null;
}

/**
 * OpenStreetMap via Leaflet, keyless. Import through `components/map` (dynamic, no SSR).
 * Pass `onPick` to let the user drop a pin (owner pin picker); `picked` shows that pin.
 */
export default function LeafletMap({
  markers = [],
  center = [17.44, 78.38],
  zoom = 12,
  onPick,
  picked,
  highlightId,
}: {
  markers?: MapMarker[];
  center?: [number, number];
  zoom?: number;
  onPick?: (lat: number, lng: number) => void;
  picked?: { lat: number; lng: number } | null;
  highlightId?: string;
}) {
  return (
    <MapContainer center={picked ? [picked.lat, picked.lng] : center} zoom={zoom} scrollWheelZoom={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {markers.length > 0 && !onPick && <FitBounds markers={markers} />}
      {markers.map((m) => (
        <Marker key={m.id} position={[m.lat, m.lng]} icon={m.id === highlightId ? foodPin : brandPin}>
          <Popup>
            <strong>{m.href ? <a href={m.href}>{m.label}</a> : m.label}</strong>
            {m.sublabel && <div>{m.sublabel}</div>}
          </Popup>
        </Marker>
      ))}
      {onPick && <ClickToPick onPick={onPick} />}
      {picked && <Marker position={[picked.lat, picked.lng]} icon={foodPin} />}
    </MapContainer>
  );
}
