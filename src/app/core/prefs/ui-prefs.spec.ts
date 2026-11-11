import { TestBed } from '@angular/core/testing';
import type { JsonObject, Profile } from '@domain/models';
import { ProfileRepository, type UiPrefsPatch } from '@domain/ports';
import {
  DEFAULT_BAR_PREFS,
  EXPLORER_WIDTH,
  MAX_SAVED_CAMERAS,
  readBarPrefs,
  readCamera,
  writeCamera,
} from './ui-prefs';
import { UI_PREFS_SAVE_DELAY_MS, UiPrefsStore } from './ui-prefs.store';

describe('ui prefs', () => {
  it('reads bar prefs with defaults and clamps the explorer width', () => {
    expect(readBarPrefs({})).toEqual(DEFAULT_BAR_PREFS);
    expect(readBarPrefs({ bars: { leftCollapsed: true, rightWidth: 9999 } })).toEqual({
      leftCollapsed: true,
      rightCollapsed: false,
      rightWidth: EXPLORER_WIDTH.max,
    });
  });

  it('keeps the most recent cameras and ignores invalid ones', () => {
    let cameras: JsonObject = {};
    for (let i = 0; i <= MAX_SAVED_CAMERAS; i++) {
      cameras = writeCamera({ cameras }, `m${i}`, { x: i, y: 0.123, zoom: 0.123456 });
    }
    expect(Object.keys(cameras)).toHaveLength(MAX_SAVED_CAMERAS);
    expect(readCamera({ cameras }, 'm0')).toBeNull();
    expect(readCamera({ cameras }, `m${MAX_SAVED_CAMERAS}`)).toEqual({
      x: MAX_SAVED_CAMERAS,
      y: 0.1,
      zoom: 0.1235,
    });
    expect(readCamera({ cameras: { m: { x: 1, y: 1, zoom: 0 } } }, 'm')).toBeNull();
    expect(readCamera({ cameras: 'x' }, 'm')).toBeNull();
  });
});

describe('UiPrefsStore', () => {
  class FakeProfiles extends ProfileRepository {
    readonly patches: UiPrefsPatch[] = [];
    override async getMine(): Promise<Profile> {
      return {
        id: 'u',
        displayName: 'U',
        avatarPath: null,
        locale: 'pt-BR',
        uiPrefs: { bars: { leftCollapsed: true } },
        createdAt: '',
        updatedAt: '',
      };
    }
    override async patchUiPrefs(patch: UiPrefsPatch): Promise<JsonObject> {
      this.patches.push(patch);
      return {};
    }
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads, applies changes at once and saves them together after a pause', async () => {
    const profiles = new FakeProfiles();
    TestBed.configureTestingModule({
      providers: [{ provide: ProfileRepository, useValue: profiles }],
    });
    const store = TestBed.inject(UiPrefsStore);
    await store.load();
    expect(store.bars().leftCollapsed).toBe(true);

    store.set('bars', { leftCollapsed: false });
    store.set('cameras', { m: { x: 1, y: 2, zoom: 1 } });
    expect(store.bars().leftCollapsed).toBe(false);
    expect(profiles.patches).toEqual([]);

    await vi.advanceTimersByTimeAsync(UI_PREFS_SAVE_DELAY_MS);
    expect(profiles.patches).toEqual([
      { bars: { leftCollapsed: false }, cameras: { m: { x: 1, y: 2, zoom: 1 } } },
    ]);
  });
});
