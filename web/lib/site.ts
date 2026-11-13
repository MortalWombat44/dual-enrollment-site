import 'server-only';
import { headers } from 'next/headers';

/**
 * The site's address for links in emails and on screen. Set SITE_URL (e.g. https://de.shastacollege.edu) in
 * production so links never depend on what a request claims its address is. Without it (local development and
 * demos), the address of the current request is used.
 */
export async function siteOrigin(): Promise<string> {
  const fixed = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^/\s]+$/.test(fixed)) return fixed;
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}
