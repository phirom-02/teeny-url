import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function NotFoundPage({ hasUser = false }: { hasUser?: boolean }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const looksLikeShortLink = /^\/[A-Za-z0-9_-]{1,64}$/.test(pathname);

  const title = looksLikeShortLink ? 'This short link doesn’t exist' : 'Page not found';
  const body = looksLikeShortLink
    ? 'Check it for typos (short links are case-sensitive). It may also have been deleted.'
    : 'There’s nothing at this address.';

  useEffect(() => {
    document.title = `${title} · Teeny-URL`;
  }, [title]);

  return (
    <section
      className="flex flex-col items-center gap-3 py-12 text-center"
      aria-labelledby="not-found-heading"
    >
      <Badge variant="accent" className="font-mono uppercase tracking-wider">
        Error 404
      </Badge>
      <h1 id="not-found-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h1>
      <p className="max-w-md text-muted-foreground">{body}</p>
      <Button asChild className="mt-3">
        <Link to="/">{hasUser ? 'Back to your links' : 'Go to Teeny-URL'}</Link>
      </Button>
    </section>
  );
}
