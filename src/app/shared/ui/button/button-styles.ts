/**
 * Classes Tailwind dos botões (docs/04 › Componentes de UI próprios).
 * Secundário e fantasma usam --wd-control-*, que mudam sobre pergaminho (.wd-page).
 * Animação só de transform (afundar 1 px ao pressionar).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-control border font-sans ' +
  'font-semibold whitespace-nowrap select-none transition-transform duration-(--wd-dur-fast) ' +
  'ease-(--wd-ease-out) active:translate-y-px motion-reduce:transition-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-ouro-500 bg-ouro-400 text-couro-950 hover:bg-ouro-300 active:bg-ouro-500',
  secondary:
    'border-(--wd-control-border) bg-(--wd-control-bg) text-(--wd-control-text) ' +
    'hover:bg-(--wd-control-bg-hover)',
  ghost: 'border-transparent bg-transparent text-(--wd-control-text) hover:bg-(--wd-control-bg)',
  danger: 'border-lacre bg-lacre text-pergaminho-50 hover:brightness-110 active:brightness-95',
};

const TEXT_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 text-xs',
  md: 'min-h-10 px-4 text-sm',
};

/** 44 px no padrão (alvo das barras), 32 px nos controles compactos. */
const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'size-8',
  md: 'size-11',
};

/** Estado ligado (ferramenta ativa): fundo ouro, ícone couro-950 (docs/05). */
const PRESSED =
  'aria-pressed:border-ouro-500 aria-pressed:bg-ouro-400 aria-pressed:text-couro-950 ' +
  'aria-pressed:hover:bg-ouro-300';

export function buttonClasses(variant: ButtonVariant, size: ButtonSize): string {
  return `${BASE} ${VARIANTS[variant]} ${TEXT_SIZES[size]}`;
}

export function iconButtonClasses(variant: ButtonVariant, size: ButtonSize): string {
  return `${BASE} ${VARIANTS[variant]} ${ICON_SIZES[size]} p-0 ${PRESSED}`;
}
