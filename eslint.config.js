import fs from 'node:fs';
import js from '@eslint/js';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Reglas de arquitectura del README (sección 3) aplicadas con herramientas.
 * Las rutas se comparan ya resueltas, así que valen igual para `@/…` que para `../…`.
 */
const FEATURES = fs
  .readdirSync(new URL('./src/features', import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const boundaries = [
  {
    target: './src/shared',
    from: ['./src/app', './src/pages', './src/features'],
    message: 'shared no depende de nadie: lo común no puede importar de app, pages ni features.',
  },
  {
    target: './src/features',
    from: './src/pages',
    message: 'features no importa de pages.',
  },
  {
    // Única excepción: la tabla de rutas (sin dependencias) para enlazar sin escribir rutas sueltas.
    target: './src/features',
    from: './src/app',
    except: ['./routes.ts'],
    message: 'features solo usa shared (y app/routes.ts). Lo demás de app se recibe por props.',
  },
  ...FEATURES.map((name) => ({
    target: `./src/features/${name}`,
    from: './src/features',
    except: [`./${name}`],
    message: 'Un módulo de features no importa de otro módulo. Lo común sube a shared.',
  })),
];

const NETWORK_MESSAGE = 'Solo src/shared/api habla con la red. Usa flightsApi.';

export default tseslint.config(
  // Los tipos generados desde el contrato no se editan a mano (npm run api:types).
  { ignores: ['dist', 'coverage', 'node_modules', 'src/shared/api/generated'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, jsxA11y.flatConfigs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'import-x': importX,
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.app.json' })],
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Las regiones con scroll (role=region) deben poder recibir foco para desplazarse con teclado (WCAG 2.1.1).
      'jsx-a11y/no-noninteractive-tabindex': ['error', { tags: [], roles: ['tabpanel', 'region'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],

      'import-x/no-restricted-paths': ['error', { zones: boundaries }],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'axios', message: NETWORK_MESSAGE }],
          patterns: [
            {
              group: ['@/features/*/**'],
              message: 'Importa el módulo por su index (@/features/<módulo>), no sus archivos internos.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: NETWORK_MESSAGE },
        { name: 'XMLHttpRequest', message: NETWORK_MESSAGE },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'fetch', message: NETWORK_MESSAGE },
        { object: 'globalThis', property: 'fetch', message: NETWORK_MESSAGE },
        { object: 'window', property: 'XMLHttpRequest', message: NETWORK_MESSAGE },
        { object: 'globalThis', property: 'XMLHttpRequest', message: NETWORK_MESSAGE },
      ],
    },
  },
  {
    // La única capa que habla con la red.
    files: ['src/shared/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['*.config.{js,ts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);
