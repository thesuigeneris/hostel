import { ButtonLink } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">The page you are looking for has moved or never existed.</p>
      <ButtonLink href="/search" className="mt-6">Find a hostel</ButtonLink>
    </div>
  );
}
