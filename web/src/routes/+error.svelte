<script lang="ts">
  import { page } from '$app/state';

  const status = $derived(page.status);
  // One path segment that could be a code or alias: most likely a mistyped or deleted short link.
  const looksLikeShortLink = $derived(/^\/[A-Za-z0-9_-]{1,64}$/.test(page.url.pathname));

  const content = $derived.by(() => {
    if (status === 404) {
      return looksLikeShortLink
        ? {
            title: 'This short link doesn’t exist',
            body: 'Check it for typos (short links are case-sensitive). It may also have been deleted.',
          }
        : {
            title: 'Page not found',
            body: 'There’s nothing at this address.',
          };
    }
    if (status === 429) {
      return {
        title: 'Slow down a little',
        body: page.error?.message ?? 'Too many requests. Please wait a moment and try again.',
      };
    }
    if (status === 502 || status === 503) {
      return {
        title: 'The API isn’t available',
        body: page.error?.message ?? 'Please try again in a moment.',
      };
    }
    return {
      title: 'Something went wrong',
      body: page.error?.message ?? 'Please try again in a moment.',
    };
  });
</script>

<svelte:head>
  <title>{content.title} · Teeny-URL</title>
</svelte:head>

<section class="error-page" aria-labelledby="error-heading">
  <p class="error-status">Error {status}</p>
  <h1 id="error-heading">{content.title}</h1>
  <p class="lede">{content.body}</p>
  <a class="button" href="/">{page.data.user ? 'Back to your links' : 'Go to Teeny-URL'}</a>
</section>

<style>
  .error-page {
    display: grid;
    justify-items: center;
    gap: var(--space-3);
    padding-block: var(--space-6);
    text-align: center;
  }

  .error-status {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .lede {
    max-width: 30rem;
  }

  .button {
    margin-top: var(--space-3);
  }
</style>
