import js from '@eslint/js';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import jsonParser from 'jsonc-eslint-parser';
import localPlugin from './eslint-rules/index.js';

export default defineConfig([
  eslintConfigPrettier,
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      'css/use-baseline': 'off'
    }
  },
  {
    files: ['**/*.json'],
    ignores: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '.sitemap-base.json'],
    plugins: {
      json,
      local: localPlugin
    },
    languageOptions: {
      parser: jsonParser
    },
    rules: {
      'local/sort-labels': 'warn'
    },
    extends: ['json/recommended']
  },
  {
    files: ['**/*.md'],
    plugins: { markdown },
    extends: ['markdown/recommended'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    rules: {
      'markdown/no-html': 'warn',
      'markdown/no-bare-urls': 'warn',
      'markdown/no-missing-label-refs': 'off'
    }
  },
  {
    ignores: [
      'node_modules',
      'external',
      'public/storage/ag/g/**/*',
      'public/storage/ag/g2/**/*',
      'public/storage/ag/a/emulatorjs/**/*',
      'public/scram/**/*',
      'public/petezah/**/*',
      '**/*.min.css',
      'public/epoxy/**/*',
      'public/baremux/**/*',
      'public/youtube/**/*.js',
      'public/static/uv/**/*',
      '.sitemap-base.json'
    ]
  },
  {
    files: ['**/sw.js'],
    languageOptions: {
      globals: {
        importScripts: 'readonly',
        worker: true
      }
    }
  }
]);
