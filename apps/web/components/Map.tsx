'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';

// Keyless OpenStreetMap tiles; a plain CSS pin avoids bundling Leaflet's marker images.
const pin = (verified: boolean) =>
  L.divIcon({
    className: '',
    // A 28px target (WCAG 2.2 target size) around an 18px dot.
    html: `<div style="width:28px;height:28px;display:grid;place-items:center"><div style="width:18px;height:18px;border-radius:9999px;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);background:${verified ? '#1F5C46' : '#E08A2E'}"></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

// OpenStreetMap's licence asks for a link to its copyright page.
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type MapPoint = { id: string; lat: number; lng: number; label: string; href?: string; verified?: boolean; sub?: string };

function Fit({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [32, 32] });
  }, [map, points]);
  return null;
}

export function HostelMap({ points, height = 420, zoom = 13 }: { points: MapPoint[]; height?: number; zoom?: number }) {
  const center: [number, number] = points[0] ? [points[0].lat, points[0].lng] : [17.44, 78.38];
  return (
    <div style={{ height }} className="overflow-hidden rounded-2xl border border-line">
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution={OSM_ATTRIBUTION} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={pin(p.verified ?? false)} title={p.label} alt={p.label}>
            <Popup>
              {p.href ? <a href={p.href}>{p.label}</a> : p.label}
              {p.sub && <div>{p.sub}</div>}
            </Popup>
          </Marker>
        ))}
        <Fit points={points} />
      </MapContainer>
    </div>
  );
}

function ClickToMove({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Owner pin picker: click the map or drag the pin; writes lat/lng into the named inputs. */
export function PinPicker({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
  const icon = useMemo(() => pin(true), []);
  return (
    <div className="h-72 overflow-hidden rounded-2xl border border-line">
      <MapContainer center={[lat, lng]} zoom={15} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution={OSM_ATTRIBUTION} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker
          position={[lat, lng]}
          icon={icon}
          title="Hostel location: drag to move"
          draggable
          eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onChange(p.lat, p.lng); } }}
        />
        <ClickToMove onPick={onChange} />
      </MapContainer>
    </div>
  );
}
