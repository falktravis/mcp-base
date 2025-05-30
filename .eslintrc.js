module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'prettier'
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  rules: {
    'prettier/prettier': 'error',
    // Add any project-specific ESLint rules here
  },
  env: {
    node: true,
    es2021: true
  },
  overrides: [
    {
      files: ['packages/frontend/**/*.ts', 'packages/frontend/**/*.tsx'],
      extends: [
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'plugin:jsx-a11y/recommended'
      ],
      settings: {
        react: {
          version: 'detect'
        }
      },
      env: {
        browser: true
      }
    }
  ]
};
