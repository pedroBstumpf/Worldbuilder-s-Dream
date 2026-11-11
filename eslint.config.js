// @ts-check
const eslint = require('@eslint/js');
const { defineConfig, globalIgnores } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const boundaries = require('eslint-plugin-boundaries');
const prettier = require('eslint-config-prettier');

/**
 * Camadas do docs/03 (seção "Camadas e dependências").
 * Cada pasta de src/app é um elemento; features/<nome> captura o nome da feature.
 * Os arquivos da raiz de src/app (app.config.ts, app.routes.ts…) montam o app e ficam fora das regras.
 */
const elements = [
  { type: 'domain', pattern: 'src/app/domain' },
  { type: 'map-engine', pattern: 'src/app/map-engine' },
  { type: 'core', pattern: 'src/app/core' },
  { type: 'data-access', pattern: 'src/app/data-access' },
  { type: 'shared', pattern: 'src/app/shared' },
  { type: 'feature', pattern: 'src/app/features/*', capture: ['feature'] },
];

const allow = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { type: to } } },
});

/** Pacotes que domain e map-engine não podem conhecer. */
const angularImports = {
  group: ['@angular/*'],
  message: 'Esta camada não conhece Angular (docs/03).',
};

module.exports = defineConfig([
  globalIgnores(['dist/', '.angular/', 'coverage/', 'playwright-report/', 'test-results/']),
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strict,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'wd', style: 'camelCase' },
      ],
      // Elemento (wd-icon) ou atributo sobre elemento nativo (button[wd-button]).
      '@angular-eslint/component-selector': [
        'error',
        [
          { type: 'element', prefix: 'wd', style: 'kebab-case' },
          { type: 'attribute', prefix: 'wd', style: 'kebab-case' },
        ],
      ],
      'no-console': 'error',
      // Classes de componente/serviço Angular podem ser vazias (o decorator é o conteúdo).
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      // Nada de innerHTML (AGENTS.md): textos são JSON do Tiptap.
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Não use innerHTML (AGENTS.md).' },
        { property: 'outerHTML', message: 'Não use outerHTML (AGENTS.md).' },
      ],
      // OnPush é o padrão no Angular 22; o opt-out (Eager) já é barrado por
      // @angular-eslint/prefer-on-push-component-change-detection (tsRecommended).
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': elements,
      'boundaries/include': ['src/**/*.ts'],
      'import/resolver': { typescript: { alwaysTryTypes: true, project: './tsconfig.app.json' } },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            allow('domain', 'domain'),
            allow('map-engine', ['map-engine', 'domain']),
            allow('core', ['core', 'domain']),
            allow('data-access', ['data-access', 'core', 'domain']),
            allow('shared', 'shared'),
            {
              // shared só conhece os tipos do domínio
              from: { element: { type: 'shared' } },
              allow: { to: { element: { type: 'domain' } }, dependency: { kind: 'type' } },
            },
            allow('feature', ['shared', 'core', 'domain', 'data-access', 'map-engine']),
            {
              // features/x só importa a própria feature; outra feature, via store ou rota
              from: { element: { type: 'feature' } },
              allow: {
                to: {
                  element: {
                    type: 'feature',
                    captured: { feature: '{{ from.element.captured.feature }}' },
                  },
                },
              },
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            angularImports,
            {
              group: ['@supabase/*', 'pixi.js', 'pixi-viewport'],
              message: 'domain é TS puro (docs/03).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/map-engine/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [angularImports] }] },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      // Em <button wd-icon-button>, o input `label` vira o aria-label (shared/ui).
      '@angular-eslint/template/elements-content': ['error', { allowList: ['label'] }],
      // [innerHTML] e [outerHTML] em templates (AGENTS.md)
      'no-restricted-syntax': [
        'error',
        {
          selector: 'BoundAttribute[name=/^(innerHTML|outerHTML)$/]',
          message: 'Não use innerHTML (AGENTS.md).',
        },
      ],
    },
  },
  prettier,
]);
