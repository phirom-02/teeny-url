import { useField, useForm, useStore } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSession } from '@/lib/api';
import { loginFormSchema } from '@/lib/schemas';
import type { Me } from '@/lib/types';

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

interface LoginPageProps {
  onSignedIn: (user: Me) => void;
}

export function LoginPage({ onSignedIn }: LoginPageProps) {
  const navigate = useNavigate();
  const keyInputRef = useRef<HTMLInputElement>(null);
  const [serverKeyError, setServerKeyError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Sign in · Teeny-URL';
  }, []);

  async function handleLoginSubmit({ value }: { value: { key: string } }) {
    setServerKeyError(null);
    setServerMessage(null);

    const trimmed = value.key.trim();
    const result = await createSession(trimmed);
    if (result.ok) {
      onSignedIn(result.data);
      await navigate({ to: '/', replace: true });
      return;
    }

    if (result.status === 401) {
      setServerKeyError(result.error.message);
    } else if (result.status === 400) {
      const keyIssue = result.error.details?.find((issue) => issue.path === 'key');
      if (keyIssue) setServerKeyError(keyIssue.message);
      else setServerMessage(result.error.message);
    } else {
      setServerMessage(result.error.message);
    }

    form.setFieldValue('key', '');
    keyInputRef.current?.focus();
  }

  const form = useForm({
    defaultValues: { key: '' },
    validators: {
      onSubmit: loginFormSchema,
    },
    onSubmit: handleLoginSubmit,
  });

  const keyField = useField({ form, name: 'key' });
  const isSubmitting = useStore(form.store, selectIsSubmitting);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  }

  function handleKeyChange(event: ChangeEvent<HTMLInputElement>) {
    setServerKeyError(null);
    keyField.handleChange(event.target.value);
  }

  const validationError =
    keyField.state.meta.isTouched || form.state.submissionAttempts > 0
      ? firstError(keyField.state.meta.errors)
      : null;
  const errorText = serverKeyError ?? validationError;

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription>
          Use one of your Teeny-URL API keys to create and manage short links.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5">
        <form className="grid gap-4" noValidate onSubmit={handleFormSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="key">API key</Label>
            <Input
              ref={keyInputRef}
              id="key"
              name={keyField.name}
              type="password"
              className="font-mono"
              required
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="tny_…"
              value={keyField.state.value}
              onBlur={keyField.handleBlur}
              onChange={handleKeyChange}
              aria-invalid={errorText ? 'true' : undefined}
              aria-describedby={errorText ? 'key-hint key-error' : 'key-hint'}
            />
            <p id="key-error" className="min-h-4 text-xs text-destructive" aria-live="polite">
              {errorText ?? ''}
            </p>
          </div>

          {serverMessage && (
            <Alert variant="destructive">
              <AlertDescription>{serverMessage}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p id="key-hint" className="text-xs leading-relaxed text-muted-foreground">
          No key yet? Create one on the server with{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
            pnpm key:create &lt;name&gt;
          </code>
          . It is shown once and stays in an httpOnly cookie on this device for 30 days.
        </p>
      </CardContent>
    </Card>
  );
}
