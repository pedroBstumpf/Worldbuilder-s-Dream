import { TestBed } from '@angular/core/testing';
import { HISTORY_LIMIT, HistoryStore } from './history.store';

describe('HistoryStore', () => {
  let store: InstanceType<typeof HistoryStore>;
  let value: number;

  /** Comando que soma `n` ao valor e sabe desfazer. */
  const add = (n: number) => async () => {
    value += n;
    return {
      undo: async () => void (value -= n),
      redo: async () => void (value += n),
    };
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [HistoryStore] });
    store = TestBed.inject(HistoryStore);
    value = 0;
  });

  it('undoes and redoes in order', async () => {
    await store.execute('um', add(1));
    await store.execute('dois', add(2));
    expect(value).toBe(3);

    expect(await store.undo()).toBe('dois');
    expect(value).toBe(1);
    expect(await store.undo()).toBe('um');
    expect(value).toBe(0);
    expect(await store.undo()).toBeNull();
    expect(store.canUndo()).toBe(false);

    expect(await store.redo()).toBe('um');
    expect(value).toBe(1);
    expect(store.canRedo()).toBe(true);
  });

  it('drops the redo stack after a new edit', async () => {
    await store.execute('um', add(1));
    await store.undo();
    await store.execute('dois', add(2));
    expect(store.canRedo()).toBe(false);
    expect(await store.redo()).toBeNull();
  });

  it('does not record a command that changed nothing', async () => {
    await store.execute('nada', async () => null);
    expect(store.canUndo()).toBe(false);
  });

  it('runs edits and undo one at a time, in the order asked', async () => {
    const slow = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return add(5)();
    };
    const edit = store.execute('lento', slow);
    const undo = store.undo();
    await Promise.all([edit, undo]);
    expect(value).toBe(0);
    expect(store.canRedo()).toBe(true);
  });

  it('drops an entry whose undo fails and keeps working', async () => {
    await store.execute('um', add(1));
    await store.execute('falha', async () => ({
      undo: () => Promise.reject(new Error('offline')),
      redo: async () => undefined,
    }));
    await expect(store.undo()).rejects.toThrow('offline');
    expect(store.canRedo()).toBe(false);
    expect(await store.undo()).toBe('um');
    expect(value).toBe(0);
  });

  it('keeps at most the limit', async () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) await store.execute(`${i}`, add(1));
    expect(store.past()).toHaveLength(HISTORY_LIMIT);
    expect(store.past()[0]?.label).toBe('5');
  });

  it('forgets everything on clear', async () => {
    await store.execute('um', add(1));
    store.clear();
    expect(store.canUndo()).toBe(false);
  });
});
