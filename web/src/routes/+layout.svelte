<script lang="ts">
  import '../app.css';
  import { enhance } from '$app/forms';
  import favicon from '#lib/assets/favicon.svg';
  import Logo from '#lib/components/Logo.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  let signingOut = $state(false);
</script>

<svelte:head>
  <link rel="icon" href={favicon} type="image/svg+xml" />
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header">
  <div class="container header-inner">
    <a class="wordmark" href="/">
      <Logo />
      <span>Teeny-URL</span>
    </a>

    <nav class="site-nav" aria-label="Account">
      <a href={data.docsUrl} rel="external">API docs</a>
      {#if data.user}
        <span class="key-chip" title="Signed in with this API key">
          <span class="visually-hidden">Signed in as</span>
          <span class="key-name">{data.user.name}</span>
          <code>{data.user.prefix}…</code>
        </span>
        <form
          method="POST"
          action="/logout"
          use:enhance={({ cancel }) => {
            if (signingOut) return cancel();
            signingOut = true;
            return async ({ update }) => {
              await update();
              signingOut = false;
            };
          }}
        >
          <button
            type="submit"
            class="button button-ghost button-small"
            aria-disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </form>
      {/if}
    </nav>
  </div>
</header>

<main id="main" class="container" tabindex="-1">
  {@render children()}
</main>

<style>
  .site-header {
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .header-inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    padding-block: var(--space-3);
  }

  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text);
    font-size: 1.125rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-decoration: none;
  }

  .wordmark:hover {
    color: var(--color-text);
  }

  .site-nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    font-size: 0.9375rem;
  }

  .key-chip {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-2);
    max-width: 100%;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    background: var(--color-accent-soft);
    overflow-wrap: anywhere;
  }

  .key-name {
    font-weight: 600;
  }

  .key-chip code {
    color: var(--color-text-muted);
  }

  main {
    padding-block: var(--space-6) var(--space-7);
  }

  main:focus {
    outline: none;
  }
</style>
