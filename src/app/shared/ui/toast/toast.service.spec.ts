import { LiveAnnouncer } from '@angular/cdk/a11y';
import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { provideUiStrings } from '../ui-strings';
import {
  TOAST_DURATION_MS,
  TOAST_MAX_VISIBLE,
  TOAST_WITH_ACTION_DURATION_MS,
  ToastService,
} from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let announce: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideUiStrings({ closeDialog: 'Fechar', dismissToast: 'Dispensar aviso' })],
    });
    service = TestBed.inject(ToastService);
    announce = vi.spyOn(TestBed.inject(LiveAnnouncer), 'announce').mockResolvedValue();
  });

  afterEach(() => vi.useRealTimers());

  const messages = () => service.toasts().map((toast) => toast.message);

  function rendered(): HTMLElement {
    TestBed.tick();
    return TestBed.inject(OverlayContainer).getContainerElement();
  }

  it('renders the toast in an overlay', () => {
    service.show({ message: 'Mundo salvo', kind: 'success' });

    const item = rendered().querySelector('wd-toast-host li');
    expect(item?.textContent).toContain('Mundo salvo');
    expect(item?.getAttribute('data-kind')).toBe('success');
  });

  it('announces politely, and errors assertively', () => {
    service.show({ message: 'Mundo salvo' });
    service.show({ message: 'Falha ao salvar', kind: 'error' });

    expect(announce).toHaveBeenCalledWith('Mundo salvo', 'polite');
    expect(announce).toHaveBeenCalledWith('Falha ao salvar', 'assertive');
  });

  it('dismisses itself after the duration', () => {
    service.show({ message: 'Mundo salvo' });

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    expect(messages()).toEqual(['Mundo salvo']);

    vi.advanceTimersByTime(1);
    expect(messages()).toEqual([]);
  });

  it('stays longer when it has an action', () => {
    service.show({ message: 'Token removido', action: { label: 'Desfazer', run: vi.fn() } });

    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(messages()).toEqual(['Token removido']);

    vi.advanceTimersByTime(TOAST_WITH_ACTION_DURATION_MS - TOAST_DURATION_MS);
    expect(messages()).toEqual([]);
  });

  it('pauses the countdown and resumes with the remaining time', () => {
    service.show({ message: 'Mundo salvo' });
    vi.advanceTimersByTime(2000);

    service.pause();
    vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
    expect(messages()).toEqual(['Mundo salvo']);

    service.resume();
    vi.advanceTimersByTime(TOAST_DURATION_MS - 2000);
    expect(messages()).toEqual([]);
  });

  it('runs the action once and dismisses the toast', () => {
    const run = vi.fn();
    service.show({ message: 'Token removido', action: { label: 'Desfazer', run } });

    const undo = Array.from(rendered().querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Desfazer',
    );
    undo?.click();

    expect(run).toHaveBeenCalledOnce();
    expect(messages()).toEqual([]);
  });

  it('dismisses with the close button', () => {
    service.show({ message: 'Mundo salvo' });

    (rendered().querySelector('button[aria-label="Dispensar aviso"]') as HTMLButtonElement).click();

    expect(messages()).toEqual([]);
  });

  it('keeps only the newest toasts', () => {
    for (let i = 1; i <= TOAST_MAX_VISIBLE + 1; i++) service.show({ message: `Aviso ${i}` });

    expect(messages()).toEqual(['Aviso 2', 'Aviso 3', 'Aviso 4']);
  });

  it('does not stay paused after the last toast is dismissed', () => {
    const id = service.show({ message: 'Primeiro' });
    service.pause();
    service.dismiss(id);

    service.show({ message: 'Segundo' });
    vi.advanceTimersByTime(TOAST_DURATION_MS);

    expect(messages()).toEqual([]);
  });
});
