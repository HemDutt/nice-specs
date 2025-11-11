export function isLikelyBinary(text: string): boolean {
  return text.includes('\u0000');
}
