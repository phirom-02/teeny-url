// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Me } from '#lib/types.ts';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      /** The signed-in key's display info (`GET /api/me`); `null` when signed out. */
      user: Me | null;
      /** The API key from the session cookie, set only once the API accepted it. Server-only. */
      apiKey: string | null;
      /** Set when the session couldn't be checked: the API is down, rate limited or misbehaving. */
      apiError: { status: number; message: string } | null;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}
