import { Component, computed, input, output } from '@angular/core';
import { MAP_STRINGS } from '@core/strings/map.strings';
import { ANNOTATION_INK_COLORS, BRUSH_WIDTHS, type BrushStyle } from '@domain/maps';
import type { ToolId } from '@engine/map-engine';

/**
 * Ferramentas que usam a cor escolhida aqui; só o pincel tem espessura, opacidade e linha.
 * O rótulo nasce em giz (legível sobre qualquer mapa) e muda de cor no editor.
 */
const COLORED_TOOLS: readonly ToolId[] = ['pin', 'brush', 'region'];

/**
 * Opções da ferramenta de anotação ativa (docs/06 §5), ao lado da barra esquerda: cor da
 * paleta de tintas e, no pincel, espessura, opacidade e linha contínua ou pontilhada.
 * Valem para as próximas anotações; as já desenhadas mudam pelo editor.
 */
@Component({
  selector: 'wd-tool-options',
  template: `
    @if (visible()) {
      <div class="panel wd-panel" role="group" [attr.aria-label]="text.label">
        <fieldset class="group">
          <legend class="legend">{{ text.color }}</legend>
          <div class="swatches">
            @for (ink of inks; track ink.id) {
              <label class="swatch" [style.--ink]="ink.hex">
                <input
                  type="radio"
                  class="sr-only"
                  name="wd-tool-color"
                  [checked]="style().color === ink.hex"
                  (change)="set({ color: ink.hex })"
                />
                <span class="dot" aria-hidden="true"></span>
                <span class="sr-only">{{ colorNames[ink.id] }}</span>
              </label>
            }
          </div>
        </fieldset>
        @if (tool() === 'brush') {
          <fieldset class="group">
            <legend class="legend">{{ text.width }}</legend>
            <div class="widths">
              @for (width of widths; track width; let i = $index) {
                <label class="width">
                  <input
                    type="radio"
                    class="sr-only"
                    name="wd-tool-width"
                    [checked]="style().width === width"
                    (change)="set({ width })"
                  />
                  <span class="line" aria-hidden="true" [style.block-size.px]="width"></span>
                  <span class="sr-only">{{ text.widths[i] }}</span>
                </label>
              }
            </div>
          </fieldset>
          <label class="group">
            <span class="legend">{{ text.opacity }}</span>
            <input
              type="range"
              class="range"
              min="10"
              max="100"
              step="10"
              [value]="opacity()"
              [attr.aria-valuetext]="opacity() + '%'"
              (input)="set({ opacity: +$any($event.target).value / 100 })"
            />
          </label>
          <fieldset class="group">
            <legend class="legend">{{ text.line }}</legend>
            <div class="lines">
              @for (dashed of [false, true]; track dashed) {
                <label class="choice">
                  <input
                    type="radio"
                    class="sr-only"
                    name="wd-tool-line"
                    [checked]="style().dashed === dashed"
                    (change)="set({ dashed })"
                  />
                  <span class="sample" aria-hidden="true" [attr.data-dashed]="dashed"></span>
                  <span class="choice-label">{{ dashed ? text.dashed : text.solid }}</span>
                </label>
              }
            </div>
          </fieldset>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset-block-start: 104px;
      inset-inline-start: 86px;
      z-index: 5;
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      inline-size: 172px;
      padding: 10px 12px;
      animation: options-in var(--wd-dur-base) var(--wd-ease-out);
    }

    .group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .legend {
      padding: 0;
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-text-muted);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .swatches {
      display: grid;
      grid-template-columns: repeat(4, 32px);
      gap: 4px;
    }

    .swatch {
      --ink: transparent;

      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      cursor: pointer;
      border: 2px solid transparent;
      border-radius: 999px;
    }

    .swatch:has(:checked) {
      border-color: var(--wd-accent);
    }

    .dot {
      inline-size: 20px;
      block-size: 20px;
      background: var(--ink);
      border: 1px solid var(--wd-divider);
      border-radius: 999px;
    }

    .widths,
    .lines {
      display: flex;
      gap: 4px;
    }

    .width,
    .choice {
      display: grid;
      flex: 1;
      place-items: center;
      min-block-size: 32px;
      padding: 4px;
      cursor: pointer;
      border: 1px solid var(--wd-divider);
      border-radius: var(--wd-radius-control);
    }

    .width:has(:checked),
    .choice:has(:checked) {
      border-color: var(--wd-accent);
      box-shadow: inset 0 0 0 1px var(--wd-accent);
    }

    .swatch:has(:focus-visible),
    .width:has(:focus-visible),
    .choice:has(:focus-visible) {
      outline: 2px solid var(--wd-focus-ring);
      outline-offset: 2px;
    }

    .line {
      inline-size: 22px;
      background: var(--wd-text-on-surface);
      border-radius: 999px;
    }

    .choice {
      gap: 2px;
    }

    .sample {
      inline-size: 36px;
      border-block-start: 3px solid var(--wd-text-on-surface);
    }

    .sample[data-dashed='true'] {
      border-block-start-style: dashed;
    }

    .choice-label {
      font-family: var(--font-sans);
      font-size: 0.75rem;
      color: var(--wd-text-on-surface);
    }

    .range {
      inline-size: 100%;
      accent-color: var(--wd-accent);
    }

    @keyframes options-in {
      from {
        opacity: 0;
        transform: translateX(-6px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel {
        animation: none;
      }
    }
  `,
})
export class ToolOptionsComponent {
  readonly tool = input.required<ToolId>();
  readonly style = input.required<BrushStyle>();
  readonly styleChange = output<BrushStyle>();

  protected readonly text = MAP_STRINGS.annotations.options;
  protected readonly colorNames = MAP_STRINGS.annotations.colors;
  protected readonly inks = ANNOTATION_INK_COLORS;
  protected readonly widths = BRUSH_WIDTHS;
  protected readonly visible = computed(() => COLORED_TOOLS.includes(this.tool()));
  protected readonly opacity = computed(() => Math.round(this.style().opacity * 100));

  protected set(change: Partial<BrushStyle>): void {
    this.styleChange.emit({ ...this.style(), ...change });
  }
}
