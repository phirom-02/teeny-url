import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiStatusError } from '@/lib/api';

interface ErrorPageProps {
  error: unknown;
}

export function ErrorPage({ error }: ErrorPageProps) {
  const status = error instanceof ApiStatusError ? error.status : 500;
  const fallbackMessage =
    error instanceof ApiStatusError ? error.message : 'Please try again in a moment.';

  let title = 'Something went wrong';
  let body = fallbackMessage;

  if (status === 429) {
    title = 'Slow down a little';
    body = fallbackMessage || 'Too many requests. Please wait a moment and try again.';
  } else if (status === 502 || status === 503) {
    title = 'The API isn’t available';
    body = fallbackMessage || 'Please try again in a moment.';
  }

  useEffect(() => {
    document.title = `${title} · Teeny-URL`;
  }, [title]);

  return (
    <section
      className="flex flex-col items-center gap-3 py-12 text-center"
      aria-labelledby="error-heading"
    >
      <Badge variant="accent" className="font-mono uppercase tracking-wider">
        Error {status}
      </Badge>
      <h1 id="error-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h1>
      <p className="max-w-md text-muted-foreground">{body}</p>
      <Button asChild className="mt-3">
        <Link to="/">Go to Teeny-URL</Link>
      </Button>
    </section>
  );
}
