'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/field';

/** Select that writes `?hostelId=` so server pages can scope their data to one hostel. */
export function HostelPicker({ hostels, value, allowAll }: { hostels: { id: string; name: string }[]; value: string; allowAll?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <Select
      aria-label="Hostel"
      className="max-w-xs"
      value={value}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        if (e.target.value) p.set('hostelId', e.target.value);
        else p.delete('hostelId');
        router.push(`${path}?${p.toString()}`);
      }}
    >
      {allowAll && <option value="">All hostels</option>}
      {hostels.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name}
        </option>
      ))}
    </Select>
  );
}
