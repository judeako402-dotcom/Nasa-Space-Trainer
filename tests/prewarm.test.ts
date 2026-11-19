import { describe, expect, it } from 'vitest';
import { shouldPrewarmAssets } from '../src/app/prewarm';

describe('startup prewarming', () => {
  it('only preloads Phaser and surface media on a non-touch device without data-saver enabled', () => {
    expect(shouldPrewarmAssets(false, false)).toBe(true);
    expect(shouldPrewarmAssets(true, false)).toBe(false);
    expect(shouldPrewarmAssets(false, true)).toBe(false);
    expect(shouldPrewarmAssets(true, true)).toBe(false);
  });
});
