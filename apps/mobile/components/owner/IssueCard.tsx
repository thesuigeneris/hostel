import { type IssueView, timeAgo, titleCase } from '@hostels/shared';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { Badge, Card, Empty, P, Row, StatusBadge } from '@/components/ui';
import { theme } from '@/lib/theme';

/** Issues as tappable cards that open the owner's issue screen, where the status can be moved forward. */
export function IssueCards({ issues, emptyText = 'No issues reported. Nice.' }: { issues: IssueView[]; emptyText?: string }) {
  if (!issues.length) return <Empty title={emptyText} />;
  return (
    <>
      {issues.map((i) => (
        <Pressable key={i.id} accessibilityRole="link" accessibilityLabel={i.title} onPress={() => router.push(`/owner/issue/${i.id}`)}>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text, flex: 1 }}>{i.title}</Text>
              {i.needsResponse && <Badge label="Waiting on you" tone="red" />}
              <StatusBadge status={i.status} />
            </Row>
            <P muted>{titleCase(i.category)} · {i.reporter?.name ?? 'A resident'} · {timeAgo(i.createdAt)} · {i.upvotes} me-too</P>
          </Card>
        </Pressable>
      ))}
    </>
  );
}
