import { z } from 'zod';
import { createApp } from './app';
import { clock, setClockOffset } from './lib/clock';
import { env } from './lib/env';
import { parseBody } from './lib/validate';

/**
 * The API as the browser tests run it (`e2e:fresh`): the real app, plus one route that moves the clock ahead so a
 * journey can reach "14 days later" (a review) in seconds. Production starts `src/index.ts`, which has no such route;
 * this file also refuses to start in production. Jobs stay off, as in every e2e run.
 */
if (env.isProduction) throw new Error('src/e2e-server.ts is for browser tests only; start src/index.ts');

const app = createApp({ log: false });

app.put('/__e2e/clock', async (c) => {
  const { offsetDays } = await parseBody(c, z.object({ offsetDays: z.number().min(0).max(400) }));
  setClockOffset(offsetDays * 86_400_000);
  return c.json({ now: clock.now().toISOString(), today: clock.today() });
});

console.log(`hostels-api (browser tests) listening on http://localhost:${env.port}`);

export default { port: env.port, fetch: app.fetch };
