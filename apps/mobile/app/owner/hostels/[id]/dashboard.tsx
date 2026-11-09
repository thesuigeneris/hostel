import { dateLabel, istDate, monthLabel, monthOf, notCountedLabel, rupees } from '@hostels/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RoleGate } from '@/components/owner/Gate';
import { HostelHeader, Muted, Stat, StatGrid, Stepper, Upsell, whileLoading } from '@/components/owner/parts';
import { Button, Card, ErrorText, H2, P, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { shiftMonth } from '@/lib/owner';
import { useLoad } from '@/lib/useLoad';

const hours = (h: number | null) => (h === null ? '—' : h < 1 ? 'under 1 h' : h < 24 ? `${Math.round(h)} h` : `${Math.round((h / 24) * 10) / 10} days`);

export default function DashboardScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Dashboard' }} />
      <Dashboard />
    </RoleGate>
  );
}

/** The website's owner dashboard in short: what the owner owes us, what they earned, occupancy and issue health. */
function Dashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const thisMonth = monthOf(istDate());
  const [month, setMonth] = useState(thisMonth);
  const s = useLoad(async () => {
    const [h, d] = await Promise.all([api.owner.hostel(id), api.owner.insights(id, month)]);
    return { h, d };
  }, [id, month]);
  const gate = whileLoading(s);
  if (gate) return gate;
  const { h, d } = s.data!;
  const bill = d.planBill;
  const leftOut = d.revenue ? notCountedLabel(d.revenue.notCounted) : null;

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <HostelHeader h={h} />
      <ErrorText>{s.error}</ErrorText>
      {bill.oldest && (
        <Card tone={bill.suspended ? 'danger' : bill.oldest.isOverdue ? 'food' : undefined}>
          <H2>{bill.suspended ? 'Paid features are paused' : bill.oldest.isOverdue ? 'Your plan bill is overdue' : 'Plan bill due'}: you owe {rupees(bill.due)}</H2>
          <P>
            {bill.suspended
              ? 'Paying turns everything back on at once. Your listing, residents and records are kept.'
              : `Due ${dateLabel(bill.oldest.dueDate)}. If it is still unpaid on ${dateLabel(bill.oldest.pausesOn)}, paid features pause until it is paid.`}
          </P>
          <Button small title={bill.suspended ? 'Pay the bill' : 'Pay now'} onPress={() => router.push(`/owner/hostels/${id}/plan`)} />
        </Card>
      )}

      <H2>Occupancy and money</H2>
      <Stepper label={monthLabel(month)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
      {d.occupancy && d.revenue ? (
        <>
          <StatGrid>
            <Stat label="Occupancy" value={d.occupancy.occupancyPct === null ? '—' : `${d.occupancy.occupancyPct}%`} hint={`${d.occupancy.occupiedBeds} of ${d.occupancy.totalBeds} beds taken`} />
            <Stat label="Residents" value={d.occupancy.activeResidents} hint={`${d.occupancy.activeSubscribers} pay online through Hostels`} />
            <Stat label="Rent you collected" value={rupees(d.revenue.rentCollected)} hint={`${rupees(Math.max(0, d.revenue.rentDue - d.revenue.rentCollected))} still due`} />
            <Stat
              label="Paid online"
              value={rupees(d.revenue.subscriptionNet)}
              hint={d.revenue.subscriptionGross ? `${rupees(d.revenue.subscriptionGross)} less ${d.revenue.platformFeePct}% fee` : 'Subscription bills paid this month, after the fee'}
            />
          </StatGrid>
          {leftOut ? <Muted>{leftOut}</Muted> : null}
        </>
      ) : (
        <Upsell hostelId={id} plan="pro" feature="Occupancy by room, rent collected and online payments" suspended={d.plan.suspended} />
      )}

      <H2>Issues</H2>
      <P muted>Seekers see your response times once residents report 3 or more issues in 90 days.</P>
      <StatGrid>
        <Stat label="Open" value={d.issues.open} onPress={() => router.push(`/owner/hostels/${id}/community`)} />
        <Stat label="Needs a reply" value={d.issues.needsResponse} hint={d.issues.needsResponse ? 'Waiting over 24 h for your answer' : 'Every open issue has an answer'} />
        <Stat label="Median first reply" value={hours(d.issues.medianHoursToFirstResponse)} hint="Last 90 days" />
        <Stat label="Median time to fix" value={hours(d.issues.medianHoursToResolve)} hint={`${d.issues.reportedLast90Days} reported in 90 days`} />
      </StatGrid>

      <H2>Demand and reviews, last 30 days</H2>
      <StatGrid>
        <Stat label="Page views" value={d.locked ? '—' : (d.views30d ?? 0)} hint={d.locked ? 'Part of Pro' : 'People who opened your listing'} />
        <Stat label="Visit requests" value={d.visitRequests30d} onPress={() => router.push('/owner/visits')} />
        <Stat label="Rating" value={d.reviews.rating === null ? '—' : `${d.reviews.rating.toFixed(1)} / 5`} hint={`${d.reviews.count} reviews`} />
        <Stat label="Without your reply" value={d.reviews.awaitingReply} onPress={() => router.push(`/owner/hostels/${id}/reviews`)} />
      </StatGrid>
    </Screen>
  );
}
