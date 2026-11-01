import { addDays, ApiError, dateLabel, istDate, type Meal, weekday, weekStart } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { Choice, HostelHeader, Muted, Stepper, Upsell, whileLoading } from '@/components/owner/parts';
import { Button, Card, ErrorText, Field, Notice, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { hasPlan, type MenuSlot, menuGrid, menuItems } from '@/lib/owner';
import { confirm, useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function MenuScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Weekly menu' }} />
      <Menu />
    </RoleGate>
  );
}

function Menu() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const thisWeek = weekStart(istDate());
  const [week, setWeek] = useState(thisWeek);
  const s = useLoad(async () => {
    const h = await api.owner.hostel(id);
    if (!hasPlan(h.plan.effective, 'partner')) return { h, menu: null, partners: [] };
    const [menu, partners] = await Promise.all([
      api.owner.menu(id, week).catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e))),
      api.hostels.foodPartners().catch(() => []),
    ]);
    return { h, menu, partners };
  }, [id, week]);
  const a = useAction();
  const [theme_, setTheme] = useState('');
  const [grid, setGrid] = useState<MenuSlot[]>([]);
  const [day, setDay] = useState(0);

  useEffect(() => {
    if (!s.data) return;
    setGrid(menuGrid(week, s.data.menu));
    setTheme(s.data.menu?.theme ?? '');
  }, [s.data, week]);

  const gate = whileLoading(s);
  if (gate) return gate;
  const { h, partners } = s.data!;
  if (!hasPlan(h.plan.effective, 'partner')) {
    return <Screen><HostelHeader h={h} /><Upsell hostelId={id} plan="partner" feature="Weekly menus" suspended={h.plan.suspended} /></Screen>;
  }
  const date = addDays(week, day);
  const slots = grid.filter((g) => g.date === date);
  const edit = (meal: Meal, patch: Partial<MenuSlot>) => setGrid((g) => g.map((x) => (x.date === date && x.meal === meal ? { ...x, ...patch } : x)));

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <HostelHeader h={h} />
      <Stepper label={`Week of ${dateLabel(week)}${week === thisWeek ? ' (this week)' : ''}`} onPrev={() => setWeek(addDays(week, -7))} onNext={() => setWeek(addDays(week, 7))} />
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      <Button
        small
        variant="secondary"
        title="Copy last week"
        busy={a.busy === 'copy'}
        onPress={async () => {
          if (!(await confirm("Replace this week with last week's menu?", 'Replace'))) return;
          a.run('copy', async () => { await api.owner.copyLastWeek(id, week); await s.reload(); }, "Copied last week's menu");
        }}
      />
      <Card>
        <Field label="Theme" value={theme_} onChangeText={setTheme} maxLength={80} placeholder="South Indian week" />
        <Choice value={String(day)} options={Array.from({ length: 7 }, (_, i) => ({ value: String(i), label: weekday(addDays(week, i)) }))} onChange={(v) => setDay(Number(v))} />
        <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 16 }}>{weekday(date)}, {dateLabel(date)}</Text>
        {slots.map((sl) => (
          <View key={sl.meal} style={{ gap: theme.spacing.xs, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }}>
            <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{sl.meal}</Text>
            <Field label="Veg dish" value={sl.vegDish} onChangeText={(v) => edit(sl.meal, { vegDish: v })} maxLength={120} />
            <Field label="Non-veg (optional)" value={sl.nonVegDish} onChangeText={(v) => edit(sl.meal, { nonVegDish: v })} maxLength={120} />
            {partners.length > 0 && (
              <Choice
                value={sl.foodPartnerId ?? ''}
                options={[{ value: '', label: 'Own kitchen' }, ...partners.map((p) => ({ value: p.id, label: p.name }))]}
                onChange={(v) => edit(sl.meal, { foodPartnerId: v || null })}
              />
            )}
          </View>
        ))}
        <Muted>Leave a veg dish empty to skip that meal. Subscribers see the menu in their app and can skip meals before the cut-off. Saving saves the whole week.</Muted>
        <Button
          title="Save menu"
          busy={a.busy === 'save'}
          onPress={() => a.run('save', async () => { await api.owner.saveMenu(id, week, { theme: theme_, items: menuItems(grid) }); await s.reload(); }, 'Menu saved')}
        />
      </Card>
    </Screen>
  );
}
