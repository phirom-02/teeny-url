import { useField, useForm, useStore } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { RecentLinkItem } from '@/components/RecentLinkItem';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createLink, listLinks } from '@/lib/api';
import { formatNumber, withoutScheme } from '@/lib/format';
import { shortenFormSchema } from '@/lib/schemas';
import type { CreateLinkBody, Link, Me, ValidationIssue } from '@/lib/types';

const RECENT_LIMIT = 5;

function firstError(errors: unknown[]): string | null {
  for (const err of errors) {
    if (typeof err === 'string' && err) return err;
    if (
      typeof err === 'object' &&
      err !== null &&
      'message' in err &&
      typeof err.message === 'string'
    ) {
      return err.message;
    }
  }
  return null;
}

function selectIsSubmitting(state: { isSubmitting: boolean }): boolean {
  return state.isSubmitting;
}

type FieldErrors = { url?: string; alias?: string };

function mapValidationIssues(issues: ValidationIssue[] = []): {
  errors: FieldErrors;
  other: string[];
} {
  const errors: FieldErrors = {};
  const other: string[] = [];
  for (const { path, message } of issues) {
    if (path === 'url' || path === 'alias') errors[path] ??= message;
    else other.push(message);
  }
  return { errors, other };
}

interface RecentState {
  links: Link[];
  total: number;
  error: string | null;
}

interface HomePageProps {
  initialRecent: RecentState;
  onSignedOut: (user: Me | null) => void;
}

export function HomePage({ initialRecent, onSignedOut }: HomePageProps) {
  const navigate = useNavigate();
  const urlInputRef = useRef<HTMLInputElement>(null);
  const aliasInputRef = useRef<HTMLInputElement>(null);

  const [created, setCreated] = useState<Link | null>(null);
  const [recent, setRecent] = useState<RecentState>(initialRecent);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const shortHost = window.location.host;

  useEffect(() => {
    document.title = 'Shorten a link · Teeny-URL';
  }, []);

  useEffect(() => {
    setRecent(initialRecent);
  }, [initialRecent]);

  async function refreshRecent() {
    const res = await listLinks(RECENT_LIMIT);
    if (res.ok) {
      setRecent({ links: res.data.data, total: res.data.pagination.total, error: null });
    } else if (res.status === 401) {
      onSignedOut(null);
      await navigate({ to: '/login', replace: true });
    } else {
      setRecent((prev) => ({ ...prev, error: res.error.message }));
    }
  }

  async function handleShortenSubmit({ value }: { value: { url: string; alias: string } }) {
    setServerErrors({});
    setServerMessage(null);

    const trimmedUrl = value.url.trim();
    const trimmedAlias = value.alias.trim();
    const body: CreateLinkBody = trimmedAlias
      ? { url: trimmedUrl, alias: trimmedAlias }
      : { url: trimmedUrl };

    const result = await createLink(body);
    if (result.ok) {
      setCreated(result.data);
      form.reset();
      await refreshRecent();
      return;
    }

    if (result.status === 401) {
      onSignedOut(null);
      await navigate({ to: '/login', replace: true });
      return;
    }

    if (result.status === 409) {
      setServerErrors({ alias: result.error.message });
      aliasInputRef.current?.focus();
      return;
    }

    if (result.status === 400) {
      const { errors, other } = mapValidationIssues(result.error.details);
      setServerErrors(errors);
      const msg = other.join(' ') || (errors.url || errors.alias ? null : result.error.message);
      setServerMessage(msg);
      if (errors.url) urlInputRef.current?.focus();
      else if (errors.alias) aliasInputRef.current?.focus();
      return;
    }

    setServerMessage(result.error.message);
  }

  const form = useForm({
    defaultValues: { url: '', alias: '' },
    validators: {
      onSubmit: shortenFormSchema,
    },
    onSubmit: handleShortenSubmit,
  });

  const urlField = useField({ form, name: 'url' });
  const aliasField = useField({ form, name: 'alias' });
  const isSubmitting = useStore(form.store, selectIsSubmitting);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  }

  function handleUrlChange(event: ChangeEvent<HTMLInputElement>) {
    setServerErrors((prev) => ({ ...prev, url: undefined }));
    urlField.handleChange(event.target.value);
  }

  function handleAliasChange(event: ChangeEvent<HTMLInputElement>) {
    setServerErrors((prev) => ({ ...prev, alias: undefined }));
    aliasField.handleChange(event.target.value);
  }

  const urlValidationError =
    urlField.state.meta.isTouched || form.state.submissionAttempts > 0
      ? firstError(urlField.state.meta.errors)
      : null;
  const urlErrorText = serverErrors.url ?? urlValidationError;

  const aliasValidationError =
    aliasField.state.meta.isTouched || form.state.submissionAttempts > 0
      ? firstError(aliasField.state.meta.errors)
      : null;
  const aliasErrorText = serverErrors.alias ?? aliasValidationError;

  const recentLinkItems = recent.links.map((link) => (
    <RecentLinkItem key={link.code} link={link} />
  ));

  return (
    <div className="grid gap-8">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Shorten a link</h1>
        <p className="text-muted-foreground">
          Paste a long URL, pick an alias if you like, and get a short link to share.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="grid gap-5" noValidate onSubmit={handleFormSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="url">Long URL</Label>
              <Input
                ref={urlInputRef}
                id="url"
                name={urlField.name}
                type="url"
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="https://example.com/a/very/long/path"
                value={urlField.state.value}
                onBlur={urlField.handleBlur}
                onChange={handleUrlChange}
                aria-invalid={urlErrorText ? 'true' : undefined}
                aria-describedby={urlErrorText ? 'url-error' : undefined}
              />
              <p id="url-error" className="min-h-4 text-xs text-destructive" aria-live="polite">
                {urlErrorText ?? ''}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="alias">
                Custom alias <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="flex items-stretch">
                <span
                  aria-hidden="true"
                  className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 font-mono text-sm text-muted-foreground select-none"
                >
                  {shortHost}/
                </span>
                <Input
                  ref={aliasInputRef}
                  id="alias"
                  name={aliasField.name}
                  type="text"
                  className="rounded-l-none font-mono"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={32}
                  placeholder="launch-day"
                  value={aliasField.state.value}
                  onBlur={aliasField.handleBlur}
                  onChange={handleAliasChange}
                  aria-invalid={aliasErrorText ? 'true' : undefined}
                  aria-describedby={aliasErrorText ? 'alias-hint alias-error' : 'alias-hint'}
                />
              </div>
              <p id="alias-hint" className="text-xs text-muted-foreground">
                Your link becomes{' '}
                <span className="font-mono text-foreground">{shortHost}/your-alias</span>. Use 3–32
                letters, digits, “-” or “_”, or leave it empty for a random code.
              </p>
              <p id="alias-error" className="min-h-4 text-xs text-destructive" aria-live="polite">
                {aliasErrorText ?? ''}
              </p>
            </div>

            {serverMessage && (
              <Alert variant="destructive">
                <AlertDescription>{serverMessage}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
                {isSubmitting ? 'Shortening…' : 'Shorten'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div aria-live="polite">
        {created && (
          <Card className="border-success/50">
            <CardContent className="grid gap-3 pt-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-success">
                <Check className="size-4" aria-hidden="true" />
                Your short link is ready
              </h2>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <a
                  href={created.shortUrl}
                  rel="external"
                  className="font-mono text-xl font-semibold text-primary hover:underline break-all"
                >
                  {withoutScheme(created.shortUrl)}
                </a>
                <CopyButton text={created.shortUrl} />
              </div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                <span aria-hidden="true">→</span>
                <span className="sr-only">Redirects to</span>
                <span className="truncate" title={created.targetUrl}>
                  {created.targetUrl}
                </span>
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <section className="grid gap-3" aria-labelledby="recent-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="recent-heading" className="text-lg font-semibold tracking-tight">
            Recent links
          </h2>
          {recent.total > recent.links.length && (
            <p className="text-xs text-muted-foreground">
              {recent.links.length} newest of {formatNumber(recent.total)}
            </p>
          )}
        </div>

        {recent.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t load your recent links. {recent.error}
            </AlertDescription>
          </Alert>
        ) : recent.links.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="py-10 text-center">
              <p className="font-semibold">No links yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Shorten your first URL above and it will show up here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">{recentLinkItems}</ul>
          </Card>
        )}
      </section>
    </div>
  );
}
