// 根目录统一 ESLint 扁平配置：所有扩展默认继承此配置。
// 某个扩展如需特殊规则，可在 extensions/<name>/eslint.config.js 中基于本配置扩展。
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/.wxt/**',
      '**/.workbuddy/**',
      '**/.preview/**',
      '.idea/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // 扩展 API 全局对象：content script / extension page 中可用
        chrome: 'readonly',
        browser: 'readonly',
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // 构建脚本、配置文件运行在 Node.js 环境
    files: [
      '**/*.config.{js,mjs,cjs,ts,mts}',
      '**/scripts/**/*.{js,mjs,ts}',
      '**/tools/**/*.{js,mjs,ts}',
      '**/vite.config.{ts,mts,js,mjs}',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  {
    // 命令行脚本需要直接向终端输出
    files: ['**/scripts/**/*.{js,mjs,ts}', '**/tools/**/*.{js,mjs,ts}'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    // 测试文件允许使用测试框架全局变量
    files: ['**/*.{test,spec}.{ts,tsx}', '**/tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
