import { newRatingLabel, RATING_NEW_NOTE, ratingView, reviewCountLabel } from '@hostels/shared';
import { Text } from 'react-native';
import { theme } from '@/lib/theme';
import { Stars } from './ui';

/**
 * A hostel's rating as the app shows it: "No reviews yet", "New · 2 reviews" below the review threshold, or the true
 * average with how many reviews it comes from. A bold 5.0 from a single review would over-promise.
 */
export function Rating({ rating, count }: { rating: number | null; count: number }) {
  const view = ratingView(rating, count);
  if (view.kind === 'none') return <Stars value={null} />;
  if (view.kind === 'new') {
    return (
      <Text style={{ fontSize: 13, color: theme.colors.soft }} accessibilityHint={RATING_NEW_NOTE}>
        {newRatingLabel(view.count)}
      </Text>
    );
  }
  return (
    <Text accessibilityLabel={`${view.rating} out of 5, from ${reviewCountLabel(view.count)}`}>
      <Stars value={view.rating} />
      <Text style={{ fontSize: 12, color: theme.colors.muted }}> ({view.count})</Text>
    </Text>
  );
}
