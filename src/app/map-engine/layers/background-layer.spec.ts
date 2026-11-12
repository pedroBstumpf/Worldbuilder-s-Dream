import { BASE_IMAGE, planBackground } from './background-layer';

describe('planBackground', () => {
  const versions = [
    { id: 'a', tickStart: 100 },
    { id: 'b', tickStart: 200 },
  ];

  it('mostra a imagem inicial antes da primeira versão e pré-carrega a seguinte', () => {
    expect(planBackground(versions, 0, 1)).toEqual({ current: BASE_IMAGE, preload: 'a' });
    expect(planBackground(versions, 0, -1)).toEqual({ current: BASE_IMAGE, preload: null });
  });

  it('pré-carrega no sentido do movimento', () => {
    expect(planBackground(versions, 150, 1)).toEqual({ current: 'a', preload: 'b' });
    expect(planBackground(versions, 150, -1)).toEqual({ current: 'a', preload: BASE_IMAGE });
    expect(planBackground(versions, 250, 1)).toEqual({ current: 'b', preload: null });
  });

  it('sem versões, só a imagem inicial', () => {
    expect(planBackground([], 999, 1)).toEqual({ current: BASE_IMAGE, preload: null });
  });
});
