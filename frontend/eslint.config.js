// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // scripts/ contiene utility Node lanciate dal build, non codice dell'app
    ignores: ['dist/*', 'scripts/*'],
  },
]);
