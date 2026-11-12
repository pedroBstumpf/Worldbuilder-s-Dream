import { Autosaver } from './autosave';

describe('Autosaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('junta as edições e grava uma vez depois da espera', async () => {
    const writes: [string, object][] = [];
    const saver = new Autosaver<{ a?: number; b?: number }>(100, async (id, patch) => {
      writes.push([id, patch]);
    });
    saver.schedule('x', { a: 1 });
    vi.advanceTimersByTime(50);
    saver.schedule('x', { b: 2 });
    vi.advanceTimersByTime(99);
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toEqual([['x', { a: 1, b: 2 }]]);
    expect(saver.has('x')).toBe(false);
  });

  it('grava uma vez por item e espera a gravação em curso', async () => {
    let release: () => void = () => undefined;
    const writes: object[] = [];
    const saver = new Autosaver<{ n: number }>(10, (_, patch) => {
      writes.push(patch);
      return new Promise<void>((resolve) => (release = resolve));
    });
    saver.schedule('x', { n: 1 });
    const first = saver.save('x');
    saver.schedule('x', { n: 2 });
    const second = saver.save('x');
    expect(writes).toEqual([{ n: 1 }]);
    release();
    await first;
    await Promise.resolve();
    expect(writes).toEqual([{ n: 1 }, { n: 2 }]);
    release();
    await second;
  });

  it('devolve à fila sob as edições novas e descarta no conflito', () => {
    const saver = new Autosaver<{ a?: number; b?: number }>(10, async () => undefined);
    saver.schedule('x', { a: 2 });
    saver.requeue('x', { a: 1, b: 1 });
    expect(saver.pendingPatch('x')).toEqual({ a: 2, b: 1 });
    saver.discard('x');
    expect(saver.has('x')).toBe(false);
    expect(saver.ids()).toEqual([]);
  });
});
