import { Badge } from '@/components/ui/badge';
import { formatClicks, withoutScheme } from '@/lib/format';
import type { Link } from '@/lib/types';

interface RecentLinkItemProps {
  link: Link;
}

export function RecentLinkItem({ link }: RecentLinkItemProps) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <a
          href={link.shortUrl}
          rel="external"
          className="font-mono font-semibold text-primary hover:underline break-all"
        >
          {withoutScheme(link.shortUrl)}
        </a>
        <span className="truncate text-sm text-muted-foreground" title={link.targetUrl}>
          <span className="sr-only">Redirects to </span>
          {link.targetUrl}
        </span>
      </div>
      <Badge
        variant="secondary"
        className="shrink-0 tabular-nums font-normal text-muted-foreground"
      >
        {formatClicks(link.clickCount)}
      </Badge>
    </li>
  );
}
