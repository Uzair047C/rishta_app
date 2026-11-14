module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
    'node-pg-migrate': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^node-pg-migrate$': '<rootDir>/node_modules/node-pg-migrate/dist/bundle/index.js',
  },
  setupFilesAfterEnv: ['<rootDir>/test/e2e-setup.ts'],
  testTimeout: 30000,
  maxWorkers: 1, // Run e2e tests sequentially to avoid DB conflicts
  transformIgnorePatterns: [
    'node_modules/(?!(@nestjs|@nestjs-redis|google-auth-library|firebase-admin|jose|jwks-rsa|pg-boss|node-pg-migrate)/)',
  ],
  extensionsToTreatAsEsm: ['.ts'],
};