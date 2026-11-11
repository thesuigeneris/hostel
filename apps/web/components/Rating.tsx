import { newRatingLabel, RATING_NEW_NOTE, ratingView, reviewCountLabel } from '@hostels/shared';
import { Stars } from './ui';

/**
 * A hostel's rating as cards and pages show it: nothing yet, "New · 2 reviews" below the review threshold, or the
 * true average in stars with how many reviews it comes from. A bold 5.0 from one review would over-promise.
 */
export function RatingSummary({ rating, count, showNone, size }: { rating: number | null; count: number; showNone?: boolean; size?: 'sm' | 'lg' }) {
  const view = ratingView(rating, count);
  if (view.kind === 'none') return showNone ? <span className="text-sm text-ink-muted">No reviews yet</span> : null;
  if (view.kind === 'new') {
    return (
      <span className="whitespace-nowrap text-sm text-ink-soft" title={RATING_NEW_NOTE}>
        {newRatingLabel(view.count)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Stars value={view.rating} size={size} />
      <span className="text-xs tabular-nums text-ink-muted">
        <span aria-hidden>({view.count})</span>
        <span className="sr-only">from {reviewCountLabel(view.count)}</span>
      </span>
    </span>
  );
}
