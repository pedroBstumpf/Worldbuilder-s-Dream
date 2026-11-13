import { readBookTimings } from './book-animator';

describe('readBookTimings', () => {
  function root(tokens: Record<string, string>): HTMLElement {
    const el = document.createElement('div');
    for (const [name, value] of Object.entries(tokens)) el.style.setProperty(name, value);
    document.body.append(el);
    return el;
  }

  afterEach(() => document.body.replaceChildren());

  it('reads durations written in milliseconds', () => {
    const timings = readBookTimings(root({ '--wd-dur-cover': '1200ms', '--wd-dur-page': '900ms' }));

    expect(timings.cover).toBe(1200);
    expect(timings.page).toBe(900);
  });

  it('reads durations in seconds, as the production css minifier writes them', () => {
    const timings = readBookTimings(
      root({ '--wd-dur-cover': '1.2s', '--wd-dur-page-short': '.45s', '--wd-dur-fade': '.15s' }),
    );

    expect(timings.cover).toBe(1200);
    expect(timings.pageShort).toBe(450);
    expect(timings.fade).toBe(150);
  });

  it('falls back to the defaults when a token is missing or invalid', () => {
    const timings = readBookTimings(root({ '--wd-dur-clasp': 'depressa' }));

    expect(timings.clasp).toBe(350);
    expect(timings.cover).toBe(1200);
    expect(timings.easePage).toBe('ease-in-out');
  });
});
