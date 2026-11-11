// Confere os contrastes WCAG da paleta (docs/05 › Acessibilidade de cor).
// Lê os hex de src/styles/palette.css; falha se uma combinação permitida cair abaixo do mínimo.
import { readFileSync } from 'node:fs';

const PALETTE = 'src/styles/palette.css';

/** [texto, fundo, mínimo]: 4,5 para texto comum; 3 para texto ≥ 24 px, ícones e ornamentos. */
const PAIRS = [
  ['pergaminho-100', 'couro-900', 4.5],
  ['pergaminho-400', 'couro-900', 4.5],
  ['ouro-400', 'couro-900', 4.5],
  ['couro-950', 'ouro-400', 4.5],
  ['couro-900', 'pergaminho-50', 4.5],
  ['couro-600', 'pergaminho-50', 4.5],
  ['lacre', 'pergaminho-50', 4.5],
  ['lacre-claro', 'couro-900', 4.5],
  ['ouro-700', 'pergaminho-50', 3],
  ['ouro-300', 'couro-900', 3], // anel de foco
  ['couro-950', 'ouro-300', 4.5], // botão primário em hover
  ['pergaminho-100', 'couro-800', 4.5], // botão secundário sobre couro
  ['couro-900', 'pergaminho-200', 4.5], // botão secundário sobre pergaminho
  ['pergaminho-50', 'lacre', 4.5], // botão destrutivo
  ['tinta', 'couro-900', 3], // ícone de aviso informativo
  ['musgo', 'couro-900', 3], // ícone de aviso de sucesso
];

const css = readFileSync(PALETTE, 'utf8');
const palette = Object.fromEntries(
  [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, hex]) => [name, hex]),
);

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const errors = [];
for (const [fg, bg, min] of PAIRS) {
  if (!palette[fg] || !palette[bg]) {
    errors.push(`${fg} ou ${bg} não existe em ${PALETTE}`);
    continue;
  }
  const ratio = contrast(palette[fg], palette[bg]);
  if (ratio < min) errors.push(`${fg} sobre ${bg}: ${ratio.toFixed(2)} : 1 (mínimo ${min} : 1)`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`✖ contraste: ${error}`);
  process.exit(1);
}
console.log(`✔ contraste: ${PAIRS.length} combinações da paleta dentro do mínimo WCAG`);
