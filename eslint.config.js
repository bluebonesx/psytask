import eslint from '@eslint/js';
import compat from 'eslint-plugin-compat';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    ignores: ['**/dist/**', 'scripts/**'],
  },
  {
    ...compat.configs['flat/recommended'],
    settings: {
      lintAllEsApis: true,
    },
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
]);
