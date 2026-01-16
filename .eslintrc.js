module.exports = {
    env: {
        commonjs: true,
        es2021: true,
        node: true,
    },
    extends: ['eslint:recommended', 'plugin:node/recommended', 'prettier'],
    parserOptions: {
        ecmaVersion: 12,
    },
    rules: {
        'no-console': 'off', // Allow console logs for this project
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'node/no-unsupported-features/es-syntax': 'off',
    },
};
