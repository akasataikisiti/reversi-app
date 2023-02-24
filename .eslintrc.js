module.exports = {
  env: {
    browser: true,
    es2021: true
  },
  parser: '@typescript-eslint/parser',
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: './tsconfig.json',
    sourceType: 'module'
  },
  plugins: ['prettier', '@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-explicit-any': 1,
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/ban-ts-ignore': 'off',
    '@typescript-eslint/no-unused-vars': 'off'
  }
}
