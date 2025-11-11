export function truncate(value: string, length = 160): string {
  if (!value) {
    return '';
  }
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
