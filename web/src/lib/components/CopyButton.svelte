<script lang="ts">
  import { onMount } from 'svelte';

  let { text }: { text: string } = $props();

  // Rendered only once JavaScript runs: without it the button couldn't do anything.
  let mounted = $state(false);
  let status = $state<'idle' | 'copied' | 'failed'>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    mounted = true;
    return () => clearTimeout(timer);
  });

  async function copy() {
    clearTimeout(timer);
    try {
      await navigator.clipboard.writeText(text);
      status = 'copied';
    } catch {
      status = 'failed'; // e.g. no clipboard access on a non-secure origin
    }
    timer = setTimeout(() => (status = 'idle'), 2000);
  }
</script>

{#if mounted}
  <button type="button" class="button button-secondary button-small copy" onclick={copy}>
    {#if status === 'copied'}
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path d="M3 8.5l3 3 7-7" />
      </svg>
      Copied
    {:else if status === 'failed'}
      Copy failed
    {:else}
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
        <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" />
      </svg>
      Copy
    {/if}
  </button>
{/if}
<span class="visually-hidden" aria-live="polite">
  {#if status === 'copied'}
    Short link copied to the clipboard.
  {:else if status === 'failed'}
    Couldn't copy. Select the link and copy it yourself.
  {/if}
</span>

<style>
  .copy {
    min-width: 6.5rem;
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
