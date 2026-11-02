import { describe, expect, test } from 'bun:test';
import { call } from './helpers';

describe('the clock route for browser tests', () => {
  test('is not part of the app production serves, and its server refuses to start in production', async () => {
    expect((await call('/__e2e/clock', { method: 'PUT', body: { offsetDays: 14 } })).status).toBe(404);
    const run = Bun.spawnSync(['bun', 'run', 'src/e2e-server.ts'], {
      cwd: `${import.meta.dir}/..`,
      env: { ...process.env, NODE_ENV: 'production', PORT: '0' },
    });
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr.toString()).toContain('for browser tests only');
  });
});
