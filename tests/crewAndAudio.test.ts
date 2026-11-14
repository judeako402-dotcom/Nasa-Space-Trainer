import { afterEach, describe, expect, it, vi } from 'vitest';
import { isExteriorApron, shouldAutoSealHelmet } from '../src/app/state';
import { SURFACE_HABITAT } from '../src/data/surfaceHabitat';

describe('EVA helmet & exterior explorer staging', () => {
  it('auto-seals helmets on Landing Pad, Exterior Pad, Airlock, exterior coordinates, or low life', () => {
    expect(shouldAutoSealHelmet('Landing Pad', 100)).toBe(true);
    expect(shouldAutoSealHelmet('Exterior Pad', 100)).toBe(true);
    expect(shouldAutoSealHelmet('Airlock', 100)).toBe(true);
    expect(shouldAutoSealHelmet('Command Center', 30)).toBe(true);
    expect(shouldAutoSealHelmet('Corridor', 100, { x: 1648, y: 1856 })).toBe(true);

    expect(isExteriorApron({ x: 1648, y: 1856 })).toBe(true);
    expect(isExteriorApron({ x: 1000, y: 900 })).toBe(false);
    expect(shouldAutoSealHelmet('Command Center', 100, { x: 1000, y: 900 })).toBe(false);
    expect(shouldAutoSealHelmet('Cafeteria', 90)).toBe(false);
    expect(shouldAutoSealHelmet('Cargo Bay', 100)).toBe(false);
  });

  it('stages Explorer Rover inside the Landing Pad bulkhead while keeping interior specialists indoors', () => {
    const rover = SURFACE_HABITAT.crew.find((c) => c.id === 'rover');
    expect(rover).toBeDefined();
    expect(rover?.art).toBe('/assets/potato-traveller.png');
    expect(rover?.exteriorOnly).toBe(false);
    expect(rover?.helmeted).toBe(true);
    expect(rover?.roomId).toBe('exterior');
    expect(rover?.futureIntegration?.status).toBe('staged');
    expect(rover?.futureIntegration?.missionKind).toBe('eva-sortie');
    expect(rover!.y).toBeLessThan(1760);
    expect(isExteriorApron({ x: rover!.x, y: rover!.y })).toBe(false);

    const interiorCrew = SURFACE_HABITAT.crew.filter((c) => c.id !== 'rover');
    expect(interiorCrew.map((c) => c.id).sort()).toEqual(['chip', 'pip', 'russet', 'tater']);
    for (const member of interiorCrew) {
      expect(member.exteriorOnly).not.toBe(true);
      expect(member.roomId).toBeTruthy();
      expect(member.patrolBounds).toBeDefined();
    }
  });
});

describe('music fade cancellation controller', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('prevents delayed stopMusic fades from pausing a newly started menu track', async () => {
    let now = 0;
    const rafQueue: Array<() => void> = [];
    const playCalls: number[] = [];
    const pauseCalls: number[] = [];

    class FakeAudio {
      src: string;
      loop = false;
      preload = 'auto';
      volume = 0;
      paused = true;
      constructor(src = '') {
        this.src = src;
      }
      play() {
        this.paused = false;
        playCalls.push(now);
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
        pauseCalls.push(now);
      }
    }

    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => { /* tracked via fadeToken */ });

    const music = await import('../src/audio/music');
    music.configureMusic({ enabled: true, volume: 80 });

    // Start menu music, immediately stop with fade (would have paused later), then restart again.
    music.startMusic(500);
    await Promise.resolve();
    expect(music.musicState().started).toBe(true);

    music.stopMusic(500);
    expect(music.musicState().started).toBe(false);

    music.startMusic(500);
    await Promise.resolve();
    expect(music.musicState().started).toBe(true);

    // Flush queued animation frames well past the original stop fade duration.
    const pausesBeforeFlush = pauseCalls.length;
    now = 2000;
    while (rafQueue.length) {
      const cb = rafQueue.shift()!;
      cb();
    }

    expect(music.musicState().started).toBe(true);
    expect(pauseCalls.length).toBe(pausesBeforeFlush);
    expect(playCalls.length).toBeGreaterThanOrEqual(2);

    // Explicit stopMusic(0) should stop synchronously and mark started false.
    music.stopMusic(0);
    expect(music.musicState().started).toBe(false);
    expect(pauseCalls.length).toBeGreaterThan(pausesBeforeFlush);
  });
});
