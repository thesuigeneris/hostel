'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Ask the browser for the visitor's position. */
export function useGeolocate() {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function locate(onFound: (lat: number, lng: number) => void) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not available in this browser.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onFound(Number(pos.coords.latitude.toFixed(5)), Number(pos.coords.longitude.toFixed(5)));
      },
      () => {
        setLocating(false);
        setError('We could not get your location. Type an area instead.');
      },
      { timeout: 10000 },
    );
  }
  return { locating, error, locate };
}

/** Hero search: free-text area/name, or "near me". */
export function SearchBox({ className, defaultValue = '' }: { className?: string; defaultValue?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);
  const geo = useGeolocate();

  return (
    <div className={className}>
      <form
        className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Area or hostel name, e.g. Gachibowli"
          aria-label="Search by area or hostel name"
          className="h-12 flex-1 rounded-xl bg-transparent px-3 text-base outline-none placeholder:text-muted"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="flex-1 sm:flex-none"
            loading={geo.locating}
            onClick={() => geo.locate((lat, lng) => router.push(`/search?lat=${lat}&lng=${lng}&sort=distance`))}
          >
            Near me
          </Button>
          <Button type="submit" size="lg" className="flex-1 sm:flex-none">
            Search
          </Button>
        </div>
      </form>
      {geo.error && <p className="mt-2 text-sm text-danger">{geo.error}</p>}
    </div>
  );
}
