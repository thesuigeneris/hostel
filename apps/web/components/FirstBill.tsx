'use client';

import { computeBill, type MealPlan } from '@hostels/shared';
import { useEffect, useRef, useState } from 'react';
import { rupees } from '@/lib/format';

type Room = { id: string; rent: number; label: string };
type Plan = { id: MealPlan; label: string };

/**
 * The first bill for the room and food plan picked in the surrounding form, updated as the picks change. Without
 * JavaScript it says the bill comes on the next step (the pay page shows it in full before anything is paid).
 */
export function FirstBill({ rooms, plans }: { rooms: Room[]; plans: Plan[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<{ room?: Room; plan?: Plan } | null>(null);

  useEffect(() => {
    const form = box.current?.closest('form');
    if (!form) return;
    const read = () => {
      const data = new FormData(form);
      setPick({ room: rooms.find((r) => r.id === data.get('roomTypeId')), plan: plans.find((p) => p.id === data.get('mealPlan')) });
    };
    read();
    form.addEventListener('change', read);
    return () => form.removeEventListener('change', read);
  }, [rooms, plans]);

  const bill = pick?.room && pick.plan ? computeBill({ rent: pick.room.rent, mealPlan: pick.plan.id, skipCredits: 0 }) : null;
  return (
    <div ref={box}>
      <h2 className="font-medium">Your first bill</h2>
      {bill && pick?.room && pick.plan ? (
        <dl className="mt-2 space-y-1.5 text-sm" aria-live="polite">
          <div className="flex justify-between gap-3"><dt className="text-ink-soft">Bed, {pick.room.label.toLowerCase()}</dt><dd className="tabular-nums">{rupees(bill.rentAmount)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-soft">Food, {pick.plan.label.toLowerCase()}</dt><dd className="tabular-nums">{bill.foodAmount ? rupees(bill.foodAmount) : '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-soft">Advance / deposit</dt><dd className="tabular-nums">₹0</dd></div>
          <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold"><dt>First month</dt><dd className="tabular-nums">{rupees(bill.totalAmount)}</dd></div>
        </dl>
      ) : (
        <p className="mt-1 text-sm text-ink-soft">You’ll see the full bill on the next step, before you pay.</p>
      )}
    </div>
  );
}
