<script lang="ts">
  import { tick } from 'svelte';
  import { enhance } from '$app/forms';
  import type { PageProps } from './$types';

  let { form }: PageProps = $props();

  let pending = $state(false);

  const keyError = $derived(form?.keyError ?? '');
  const message = $derived(form?.message ?? '');
</script>

<svelte:head>
  <title>Sign in · Teeny-URL</title>
</svelte:head>

<section class="card auth" aria-labelledby="login-heading">
  <div class="page-header">
    <h1 id="login-heading">Sign in</h1>
    <p class="lede">Use one of your Teeny-URL API keys to create and manage short links.</p>
  </div>

  <form
    method="POST"
    class="auth-form"
    aria-busy={pending}
    use:enhance={({ cancel }) => {
      if (pending) return cancel();
      pending = true;
      return async ({ result, update, formElement }) => {
        await update();
        pending = false;
        if (result.type === 'failure') {
          await tick();
          formElement.querySelector<HTMLInputElement>('#key')?.select();
        }
      };
    }}
  >
    <div class="field">
      <label for="key">API key</label>
      <!-- svelte-ignore a11y_autofocus (the key is the only thing to fill in) -->
      <input
        id="key"
        name="key"
        type="password"
        class="input mono"
        required
        autofocus
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        placeholder="tny_…"
        aria-invalid={keyError ? 'true' : undefined}
        aria-describedby={keyError ? 'key-hint key-error' : 'key-hint'}
      />
      <p id="key-error" class="field-error" aria-live="polite">{keyError}</p>
    </div>

    {#if message}
      <p class="notice notice-error" role="alert">{message}</p>
    {/if}

    <button type="submit" class="button" aria-disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  </form>

  <p id="key-hint" class="hint">
    No key yet? Create one on the server with <code>pnpm key:create &lt;name&gt;</code>. It is shown
    once and stays in an httpOnly cookie on this device for 30 days.
  </p>
</section>

<style>
  .auth {
    display: grid;
    gap: var(--space-5);
    max-width: 28rem;
    margin-inline: auto;
  }

  .auth .page-header {
    margin-bottom: 0;
  }

  .auth-form {
    display: grid;
    gap: var(--space-4);
  }
</style>
