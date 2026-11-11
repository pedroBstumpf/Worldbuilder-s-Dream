import { TestBed } from '@angular/core/testing';
import type { World } from '@domain/models';
import { WorldRepository } from '@domain/ports';
import { WorldPrefetch } from './world-prefetch.service';

describe('WorldPrefetch', () => {
  const world = { id: 'w1', name: 'Valmora' } as World;

  function setup(get: (id: string) => Promise<World | null>) {
    const repo = { get: vi.fn(get) };
    TestBed.configureTestingModule({ providers: [{ provide: WorldRepository, useValue: repo }] });
    return { repo, prefetch: TestBed.inject(WorldPrefetch) };
  }

  it('hands the early read to the map screen without reading twice', async () => {
    const { repo, prefetch } = setup(async () => world);

    prefetch.prefetch('w1');
    const result = await prefetch.take('w1');

    expect(result).toBe(world);
    expect(repo.get).toHaveBeenCalledOnce();
  });

  it('reads again after the prefetched world was taken', async () => {
    const { repo, prefetch } = setup(async () => world);

    await prefetch.take('w1');
    await prefetch.take('w1');

    expect(repo.get).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failed read', async () => {
    let fail = true;
    const { prefetch } = setup(async () => {
      if (fail) throw new Error('offline');
      return world;
    });

    await expect(prefetch.prefetch('w1')).rejects.toThrow('offline');
    fail = false;

    expect(await prefetch.take('w1')).toBe(world);
  });
});
