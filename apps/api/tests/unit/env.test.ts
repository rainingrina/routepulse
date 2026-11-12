import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgresql://u@localhost:5432/db',
  SESSION_SECRET: 'x'.repeat(32),
  DEMO_MODE: 'true',
};

describe('loadConfig (hand-written validation)', () => {
  it('accepts a valid environment', () => {
    const c = loadConfig(valid);
    expect(c).toMatchObject({ nodeEnv: 'test', port: 4000, demoMode: true, logLevel: 'silent' });
  });

  it('collects every problem instead of stopping at the first', () => {
    try {
      loadConfig({ ...valid, PORT: 'abc', DATABASE_URL: 'mysql://x', SESSION_SECRET: 'short', DEMO_MODE: 'yes' });
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).problems).toHaveLength(4);
    }
  });

  it('defaults DEMO_MODE to false when unset', () => {
    const { DEMO_MODE: _omit, ...rest } = valid;
    expect(loadConfig(rest).demoMode).toBe(false);
  });
});
