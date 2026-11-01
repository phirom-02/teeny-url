<script lang="ts">
  import { tick } from 'svelte';
  import { enhance } from '$app/forms';
  import CopyButton from '#lib/components/CopyButton.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  let pending = $state(false);

  const created = $derived(form?.created ?? null);
  const errors = $derived(form?.errors ?? {});
  const values = $derived(form?.values ?? { url: '', alias: '' });
  // Without JS a failed submit reloads the page: start on the first invalid field. (Enhanced
  // submits focus it in `use:enhance` below; `autofocus` only applies when an input is created.)
  const autofocusAlias = $derived(!errors.url && !!errors.alias);

  // A browser-side hint only; the API's zod schema decides (src/schemas/links.ts).
  const ALIAS_PATTERN = '[A-Za-z0-9_\\-]{3,32}';
  const numbers = new Intl.NumberFormat('en');

  function withoutScheme(url: string): string {
    return url.replace(/^https?:\/\//, '');
  }

  function clicks(count: number): string {
    return `${numbers.format(count)} ${count === 1 ? 'click' : 'clicks'}`;
  }
</script>

<svelte:head>
  <title>Shorten a link · Teeny-URL</title>
</svelte:head>

<div class="page-header">
  <h1>Shorten a link</h1>
  <p class="lede">Paste a long URL, pick an alias if you like, and get a short link to share.</p>
</div>

<form
  method="POST"
  class="card shorten"
  aria-busy={pending}
  use:enhance={({ cancel }) => {
    if (pending) return cancel();
    pending = true;
    return async ({ result, update, formElement }) => {
      await update(); // re-renders with the action's result; resets the form on success
      pending = false;
      if (result.type === 'failure') {
        await tick();
        formElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      }
    };
  }}
>
  <div class="field">
    <label for="url">Long URL</label>
    <!-- svelte-ignore a11y_autofocus (shortening a link is what this page is for) -->
    <input
      id="url"
      name="url"
      type="url"
      class="input"
      required
      autofocus={!autofocusAlias}
      autocomplete="off"
      spellcheck="false"
      placeholder="https://example.com/a/very/long/path"
      value={values.url}
      aria-invalid={errors.url ? 'true' : undefined}
      aria-describedby={errors.url ? 'url-error' : undefined}
    />
    <p id="url-error" class="field-error" aria-live="polite">{errors.url ?? ''}</p>
  </div>

  <div class="field">
    <label for="alias">Custom alias <span class="optional">(optional)</span></label>
    <div class="input-group">
      <span class="input-prefix" aria-hidden="true">{data.shortHost}/</span>
      <!-- svelte-ignore a11y_autofocus (only after a failed no-JS submit with a bad alias) -->
      <input
        id="alias"
        name="alias"
        type="text"
        class="input"
        autofocus={autofocusAlias}
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        maxlength="32"
        pattern={ALIAS_PATTERN}
        title="3–32 letters, digits, - or _"
        placeholder="launch-day"
        value={values.alias}
        aria-invalid={errors.alias ? 'true' : undefined}
        aria-describedby={errors.alias ? 'alias-hint alias-error' : 'alias-hint'}
      />
    </div>
    <p id="alias-hint" class="hint">
      Your link becomes <span class="mono">{data.shortHost}/your-alias</span>. Use 3–32 letters,
      digits, “-” or “_”, or leave it empty for a random code.
    </p>
    <p id="alias-error" class="field-error" aria-live="polite">{errors.alias ?? ''}</p>
  </div>

  {#if form?.message}
    <p class="notice notice-error" role="alert">{form.message}</p>
  {/if}

  <div class="actions">
    <button type="submit" class="button" aria-disabled={pending}>
      {pending ? 'Shortening…' : 'Shorten'}
    </button>
  </div>
</form>

<div class="result-region" aria-live="polite">
  {#if created}
    <section class="card result" aria-labelledby="result-heading">
      <h2 id="result-heading" class="result-heading">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M3 8.5l3 3 7-7" />
        </svg>
        Your short link is ready
      </h2>
      <div class="result-row">
        <a class="short-link" href={created.shortUrl} rel="external">
          {withoutScheme(created.shortUrl)}
        </a>
        <CopyButton text={created.shortUrl} />
      </div>
      <p class="result-target">
        <span aria-hidden="true">→</span>
        <span class="visually-hidden">Redirects to</span>
        <span class="truncate" title={created.targetUrl}>{created.targetUrl}</span>
      </p>
    </section>
  {/if}
</div>

<section class="recent" aria-labelledby="recent-heading">
  <div class="section-header">
    <h2 id="recent-heading">Recent links</h2>
    {#if data.recent.total > data.recent.links.length}
      <p class="hint">{data.recent.links.length} newest of {numbers.format(data.recent.total)}</p>
    {/if}
  </div>

  {#if data.recent.error}
    <p class="notice notice-error">Couldn't load your recent links. {data.recent.error}</p>
  {:else if data.recent.links.length === 0}
    <div class="card empty">
      <p class="empty-title">No links yet</p>
      <p class="hint">Shorten your first URL above and it will show up here.</p>
    </div>
  {:else}
    <ul class="card link-list">
      {#each data.recent.links as link (link.code)}
        <li class="link-item">
          <div class="link-main">
            <a class="link-short" href={link.shortUrl} rel="external">
              {withoutScheme(link.shortUrl)}
            </a>
            <span class="link-target truncate" title={link.targetUrl}>
              <span class="visually-hidden">Redirects to</span>
              {link.targetUrl}
            </span>
          </div>
          <span class="link-clicks">{clicks(link.clickCount)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .shorten {
    display: grid;
    gap: var(--space-5);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .result {
    margin-top: var(--space-5);
    border-color: color-mix(in srgb, var(--color-success) 45%, var(--color-border));
    animation: rise var(--duration-enter) ease-out;
  }

  .result-heading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-success);
    font-size: 0.9375rem;
  }

  .result-heading svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .result-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .short-link {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .result-target {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .recent {
    margin-top: var(--space-7);
  }

  .section-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .empty {
    padding-block: var(--space-6);
    border-style: dashed;
    box-shadow: none;
    text-align: center;
  }

  .empty-title {
    font-weight: 600;
  }

  .link-list {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
  }

  .link-item {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
  }

  .link-item + .link-item {
    border-top: 1px solid var(--color-border);
  }

  .link-main {
    display: grid;
    flex: 1;
    gap: 0.125rem;
    min-width: 0;
  }

  .link-short {
    font-family: var(--font-mono);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .link-target {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .link-clicks {
    flex: none;
    padding: 0.125rem var(--space-2);
    border-radius: var(--radius-full);
    background: var(--color-surface-muted);
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  @media (max-width: 30rem) {
    .actions .button {
      width: 100%;
    }

    .link-item {
      padding-inline: var(--space-4);
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(0.25rem);
    }
  }
</style>
