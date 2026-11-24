# Project Lint Rules

Custom coding and style rules enforced across Teeny-URL in addition to Biome (`pnpm lint`) and TypeScript (`pnpm typecheck`). All agents and reviewers must follow these rules.

## React & JSX (`web/`)

### 1. No inline functions in JSX
Do not write inline arrow or anonymous functions inside JSX props or callbacks (e.g., `onSubmit`, `onChange`, `onClick`, render props).

- Extract named handler or selector functions (e.g., `handleFormSubmit`, `handleUrlChange`, `selectIsSubmitting`) and pass them by reference.
- With TanStack Form, prefer `useField` and `useStore` over inline render-prop callbacks (`<form.Field>{(field) => ...}</form.Field>`).

**Avoid:**
```tsx
<form
  onSubmit={(event) => {
    event.preventDefault();
    void form.handleSubmit();
  }}
>
  <Input onChange={(event) => field.handleChange(event.target.value)} />
</form>
```

**Prefer:**
```tsx
function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  event.stopPropagation();
  void form.handleSubmit();
}

function handleUrlChange(event: ChangeEvent<HTMLInputElement>) {
  urlField.handleChange(event.target.value);
}

<form onSubmit={handleFormSubmit}>
  <Input onChange={handleUrlChange} />
</form>
```

### 2. No JSX render helper functions
Do not write plain `render*()` functions (e.g., `renderRecentLink`, `renderRow`, `renderItem`) that return JSX inside or alongside another component.

- Extract reusable UI or list-item markup into a proper React component (PascalCase), preferring a dedicated file under `web/src/components/`.
- Render it as a JSX element (`<RecentLinkItem key={link.code} link={link} />`).

**Avoid:**
```tsx
function renderRecentLink(link: Link) {
  return <li key={link.code}>{link.shortUrl}</li>;
}

<ul>{recent.links.map(renderRecentLink)}</ul>
```

**Prefer:**
```tsx
// web/src/components/RecentLinkItem.tsx
export function RecentLinkItem({ link }: RecentLinkItemProps) {
  return <li>{link.shortUrl}</li>;
}

// web/src/routes/HomePage.tsx
const recentLinkItems = recent.links.map((link) => (
  <RecentLinkItem key={link.code} link={link} />
));

<ul>{recentLinkItems}</ul>
```

### 3. Function export style (components vs hooks/utils)
- **React components (exception):** all React components must use traditional function declarations (`export function ComponentName(...) {}` or `export default function ComponentName(...) {}`).
- **shadcn/ui primitives (`web/src/components/ui/*`):** keep imported shadcn/ui components as-is; do not rewrite their generated structure or export style.
- **Hooks, utilities, and other non-component functions (`web/src/lib/*`, custom hooks, helpers, etc.):**
  - **Default export:** use a traditional function declaration (`export default function ...`).
  - **Named export:** use an arrow function (`export const ... = (...) => { ... };`).

**Avoid:**
```ts
// React component using arrow function
export const CopyButton = ({ text }: CopyButtonProps) => {
  return <Button>{text}</Button>;
};

// Named utility/hook using function declaration
export function formatClicks(count: number): string {
  return `${count} clicks`;
}
```

**Prefer:**
```tsx
// React component: traditional function declaration
export function CopyButton({ text }: CopyButtonProps) {
  return <Button>{text}</Button>;
}

// Named utility/hook: arrow function
export const formatClicks = (count: number): string => {
  return `${count} clicks`;
};

// Default-exported utility/hook: traditional function declaration
export default function useDebounce<T>(value: T, delayMs: number): T {
  // ...
}
```
