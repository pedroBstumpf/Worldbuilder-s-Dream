import {
  aspectMismatch,
  imageVersionIndexAt,
  planAspectFit,
  sortImageVersions,
} from './image-versions';

describe('imageVersionIndexAt', () => {
  const versions = sortImageVersions([{ tickStart: 300 }, { tickStart: 100 }, { tickStart: 200 }]);

  it('usa a imagem inicial antes da primeira versão', () => {
    expect(imageVersionIndexAt(versions, 99)).toBe(-1);
    expect(imageVersionIndexAt([], 1_000)).toBe(-1);
  });

  it('escolhe a de maior início que não passa do instante', () => {
    expect(imageVersionIndexAt(versions, 100)).toBe(0);
    expect(imageVersionIndexAt(versions, 199)).toBe(0);
    expect(imageVersionIndexAt(versions, 200)).toBe(1);
    expect(imageVersionIndexAt(versions, -50)).toBe(-1);
  });

  it('a última vale para sempre', () => {
    expect(imageVersionIndexAt(versions, 10_000_000)).toBe(2);
  });
});

describe('aspectMismatch', () => {
  it('tolera até 1 % de diferença', () => {
    expect(aspectMismatch({ width: 1000, height: 500 }, { width: 2000, height: 1000 })).toBe(false);
    expect(aspectMismatch({ width: 1009, height: 500 }, { width: 2000, height: 1000 })).toBe(false);
    expect(aspectMismatch({ width: 1000, height: 600 }, { width: 2000, height: 1000 })).toBe(true);
  });
});

describe('planAspectFit', () => {
  const target = { width: 2000, height: 1000 };

  it('corta as sobras de uma imagem mais alta, centrada', () => {
    const plan = planAspectFit({ width: 1000, height: 1000 }, target, 'crop', 8192);
    expect(plan.canvas).toEqual({ width: 1000, height: 500 });
    expect(plan).toMatchObject({ x: 0, y: -250, width: 1000, height: 1000 });
  });

  it('enquadra com margens dos lados', () => {
    const plan = planAspectFit({ width: 1000, height: 1000 }, target, 'pad', 8192);
    expect(plan.canvas).toEqual({ width: 2000, height: 1000 });
    expect(plan).toMatchObject({ x: 500, y: 0, width: 1000, height: 1000 });
  });

  it('reduz tudo se a tela passar do lado máximo', () => {
    const plan = planAspectFit({ width: 8000, height: 8000 }, target, 'pad', 8192);
    expect(plan.canvas).toEqual({ width: 8192, height: 4096 });
    expect(plan.width).toBeCloseTo(4096);
    expect(plan.x).toBeCloseTo(2048);
  });
});
