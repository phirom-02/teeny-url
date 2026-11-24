import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { deleteSession } from '@/lib/api';
import type { Me } from '@/lib/types';

interface RootLayoutProps {
  user: Me | null;
  onUserChange: (user: Me | null) => void;
}

export function RootLayout({ user, onUserChange }: RootLayoutProps) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await deleteSession();
      onUserChange(null);
      await navigate({ to: '/login', replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-foreground hover:text-foreground"
          >
            <Logo />
            <span>Teeny-URL</span>
          </Link>

          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-label="Account">
            <a
              href="/docs"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              API docs
            </a>
            {user && (
              <>
                <Badge
                  variant="accent"
                  className="max-w-full py-1 px-3 text-xs font-normal"
                  title="Signed in with this API key"
                >
                  <span className="sr-only">Signed in as</span>
                  <span className="font-semibold text-foreground">{user.name}</span>
                  <code className="font-mono text-muted-foreground">{user.prefix}…</code>
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={signingOut}
                  onClick={handleSignOut}
                >
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 outline-none"
      >
        <Outlet />
      </main>
    </div>
  );
}
