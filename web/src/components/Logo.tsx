export const Logo = () => {
  return (
    <svg
      className="size-7 shrink-0 block"
      viewBox="0 0 32 32"
      width="28"
      height="28"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="fill-primary" width="32" height="32" rx="8" />
      <g
        className="fill-none stroke-primary-foreground"
        strokeWidth="2.5"
        transform="rotate(-45 16 16)"
      >
        <rect x="5" y="12" width="13" height="8" rx="4" />
        <rect x="14" y="12" width="13" height="8" rx="4" />
      </g>
    </svg>
  );
};
