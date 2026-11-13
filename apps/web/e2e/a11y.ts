import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { API } from './helpers';

const WIDTHS = [360, 390, 768, 1024, 1440];

/**
 * Problems with the page as it stands (no reload, so flash messages and post-action states are kept): serious or
 * critical axe findings against WCAG 2.2 AA, and horizontal scrolling at each width from 360 to 1440 px.
 */
export async function pageProblems(page: Page, label = new URL(page.url()).pathname): Promise<string[]> {
  const problems: string[] = [];
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  for (const v of axe.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
    problems.push(`${label}: ${v.id} ${v.nodes[0]?.target} ${v.nodes[0]?.failureSummary?.replace(/\s+/g, ' ').slice(0, 160)}`);
  }
  const before = page.viewportSize();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    if (sw > vw + 1) problems.push(`${label}: ${sw - vw}px overflow at ${width}`);
  }
  if (before) await page.setViewportSize(before);
  return problems;
}

/**
 * Moves the API's clock this many days ahead of real time (0 puts it back). Only the browser-test API
 * (`apps/api/src/e2e-server.ts`, started by `e2e:fresh`) has this route; returns false when it isn't there.
 */
export async function setApiClock(offsetDays: number): Promise<boolean> {
  const res = await fetch(`${API}/__e2e/clock`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offsetDays }) });
  return res.ok;
}

/** Today in IST, as YYYY-MM-DD. */
export function istToday(offsetDays = 0) {
  return new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** POST to the API as `token`, failing loudly. */
export async function apiPost<T = unknown>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
