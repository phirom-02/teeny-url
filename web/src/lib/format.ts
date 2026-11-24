const numbers = new Intl.NumberFormat('en');

export const withoutScheme = (url: string): string => {
  return url.replace(/^https?:\/\//, '');
};

export const formatClicks = (count: number): string => {
  return `${numbers.format(count)} ${count === 1 ? 'click' : 'clicks'}`;
};

export const formatNumber = (count: number): string => {
  return numbers.format(count);
};
