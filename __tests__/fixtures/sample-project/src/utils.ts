export async function hash(input: string): Promise<string> {
  return Buffer.from(input).toString('base64');
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
