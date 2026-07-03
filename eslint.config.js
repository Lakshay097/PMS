// Minimal ESLint config for a one-time Rules of Hooks sweep.
// Scope: react-hooks rules only — no style, no other lint categories.
// To add this to the build pipeline later, add "eslint src" to the lint script in package.json.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  // Ignore everything outside src/ and generated/build output
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'server/**',       // server-side TS — no React hooks here
      '*.config.*',      // vite.config.ts etc.
      'scripts/**',
    ],
  },

  // Base JS recommended (no-unused-vars etc.) — off for this sweep,
  // but required as the foundation layer for typescript-eslint.
  js.configs.recommended,

  // TypeScript-aware parsing for all .ts/.tsx files under src/
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // ── The two rules we care about ──────────────────────────────────
      'react-hooks/rules-of-hooks':  'error',   // catches hook-after-return
      'react-hooks/exhaustive-deps': 'warn',    // catches stale closure bugs

      // ── Silence everything else so the output stays focused ──────────
      // typescript-eslint recommended turns these on; mute them for now.
      '@typescript-eslint/no-explicit-any':          'off',
      '@typescript-eslint/no-unused-vars':           'off',
      '@typescript-eslint/no-require-imports':       'off',
      '@typescript-eslint/no-unused-expressions':    'off',
      'no-unused-vars':                              'off',
      'no-undef':                                    'off',
      'no-console':                                  'off',
      'no-useless-catch':                            'off',
      'prefer-const':                                'off',
      '@typescript-eslint/ban-ts-comment':           'off',
    },
  },
);
