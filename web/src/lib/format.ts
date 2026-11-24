const numbers = new Intl.NumberFormat('en');

export function withoutScheme(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export function formatClicks(count: number): string {
  return `${numbers.format(count)} ${count === 1 ? 'click' : 'clicks'}`;
}

export function formatNumber(count: number): string {
  return numbers.format(count);
}
