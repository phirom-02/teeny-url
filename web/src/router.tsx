import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useLoaderData,
} from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import { ApiStatusError, getMe, listLinks } from '@/lib/api';
import type { Link, Me } from '@/lib/types';
import { ErrorPage } from '@/routes/ErrorPage';
import { HomePage } from '@/routes/HomePage';
import { LoginPage } from '@/routes/LoginPage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { RootLayout } from '@/routes/RootLayout';

const RECENT_LIMIT = 5;

let currentUser: Me | null = null;
const userListeners = new Set<() => void>();

function syncUser(user: Me | null) {
  currentUser = user;
  for (const listener of userListeners) {
    listener();
  }
}

function subscribeUser(listener: () => void) {
  userListeners.add(listener);
  return () => {
    userListeners.delete(listener);
  };
}

function useSessionUser(): Me | null {
  return useSyncExternalStore(subscribeUser, () => currentUser);
}

async function resolveSession(): Promise<Me | null> {
  const me = await getMe();
  if (me.ok) {
    syncUser(me.data);
    return me.data;
  }
  if (me.status === 401) {
    syncUser(null);
    return null;
  }
  const status = me.status === 429 || me.status === 503 ? me.status : 502;
  throw new ApiStatusError(status, me.error.code, me.error.message);
}

const rootRoute = createRootRoute({
  beforeLoad: async () => {
    const me = await getMe();
    if (me.ok) {
      syncUser(me.data);
      return { user: me.data, sessionError: null as ApiStatusError | null };
    }
    if (me.status === 401) {
      syncUser(null);
      return { user: null as Me | null, sessionError: null as ApiStatusError | null };
    }
    const status = me.status === 429 || me.status === 503 ? me.status : 502;
    return {
      user: null as Me | null,
      sessionError: new ApiStatusError(status, me.error.code, me.error.message),
    };
  },
  component: function RootComponent() {
    const user = useSessionUser();
    return <RootLayout user={user} onUserChange={syncUser} />;
  },
  notFoundComponent: function RootNotFound() {
    const user = useSessionUser();
    return <NotFoundPage hasUser={user !== null} />;
  },
  errorComponent: function RootError({ error }) {
    return <ErrorPage error={error} />;
  },
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    if (context.sessionError) throw context.sessionError;
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  loader: async () => {
    const result = await listLinks(RECENT_LIMIT);
    if (!result.ok && result.status === 401) {
      syncUser(null);
      throw redirect({ to: '/login' });
    }
    return {
      recent: result.ok
        ? { links: result.data.data, total: result.data.pagination.total, error: null }
        : { links: [] as Link[], total: 0, error: result.error.message },
    };
  },
  component: function HomeComponent() {
    const { recent } = useLoaderData({ from: homeRoute.id });
    return <HomePage initialRecent={recent} onSignedOut={syncUser} />;
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: async ({ context }) => {
    if (context.user) {
      throw redirect({ to: '/' });
    }
    if (!context.sessionError) {
      return;
    }
    // Re-check only if the root check had a transient error when landing directly on /login.
    try {
      const user = await resolveSession();
      if (user) throw redirect({ to: '/' });
    } catch {
      // Let /login render so the visitor still sees the sign-in screen.
    }
  },
  component: function LoginComponent() {
    return <LoginPage onSignedIn={syncUser} />;
  },
});

const routeTree = rootRoute.addChildren([homeRoute, loginRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
