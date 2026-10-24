import { LinkButton } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="mt-2 text-ink-soft">The page may have moved, or the listing is no longer live.</p>
      <LinkButton href="/hostels" className="mt-6">Find a hostel</LinkButton>
    </div>
  );
}
