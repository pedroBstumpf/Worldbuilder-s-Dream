import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ButtonComponent } from '../button/button.component';
import { provideUiStrings } from '../ui-strings';
import { DialogComponent } from './dialog.component';
import { DialogService } from './dialog.service';

interface TestData {
  readonly ornate: boolean;
}

@Component({
  imports: [DialogComponent, ButtonComponent],
  template: `
    <wd-dialog title="Renomear mundo" [ornate]="data.ornate">
      <p>Novo nome do mundo.</p>
      <button wd-button wdDialogAction type="button" (click)="ref.close('ok')">Salvar</button>
    </wd-dialog>
  `,
})
class RenameDialogComponent {
  readonly data = inject<TestData>(DIALOG_DATA);
  readonly ref = inject(DialogRef);
}

describe('DialogService and DialogComponent', () => {
  let overlay: HTMLElement;
  let opener: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideUiStrings({ closeDialog: 'Fechar', dismissToast: 'Dispensar' })],
    });
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
    opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
    opener.remove();
  });

  function open(options: { ornate?: boolean; disableClose?: boolean } = {}) {
    const ref = TestBed.inject(DialogService).open<RenameDialogComponent, TestData, string>(
      RenameDialogComponent,
      { data: { ornate: options.ornate ?? false }, disableClose: options.disableClose },
    );
    TestBed.tick();
    const closed = vi.fn();
    ref.closed.subscribe(closed);
    const container = overlay.querySelector('[role="dialog"]') as HTMLElement;
    return { ref, container, closed };
  }

  const isOpen = () => overlay.querySelector('[role="dialog"]') !== null;

  const pressEscape = () =>
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );

  it('labels the modal dialog with its title', () => {
    const { container } = open();
    const titleId = container.getAttribute('aria-labelledby') ?? '';

    expect(container.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(titleId)?.textContent?.trim()).toBe('Renomear mundo');
  });

  it('moves focus into the dialog', () => {
    const { container } = open();
    expect(container.contains(document.activeElement)).toBe(true);
  });

  it('closes with the close button and restores focus', () => {
    const { container, closed } = open();

    (container.querySelector('button[aria-label="Fechar"]') as HTMLButtonElement).click();

    expect(closed).toHaveBeenCalledWith(undefined);
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('returns the result chosen in the actions', () => {
    const { container, closed } = open();

    (container.querySelector('[wdDialogAction]') as HTMLButtonElement).click();

    expect(closed).toHaveBeenCalledWith('ok');
  });

  it('closes on Escape', () => {
    open();
    pressEscape();
    expect(isOpen()).toBe(false);
  });

  it('stays open on Escape when disableClose is set', () => {
    open({ disableClose: true });
    pressEscape();
    expect(isOpen()).toBe(true);
  });

  it('draws the corner ornaments only when ornate', () => {
    expect(open().container.querySelectorAll('svg.corner')).toHaveLength(0);
  });

  it('draws four corner ornaments when ornate', () => {
    expect(open({ ornate: true }).container.querySelectorAll('svg.corner')).toHaveLength(4);
  });
});
