module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'server/src/**/*.ts',
    '!server/src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      diagnostics: {
        ignoreCodes: [151002],
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/server/src/$1',
    '^@config/(.*)$': '<rootDir>/server/src/config/$1',
    '^@controllers/(.*)$': '<rootDir>/server/src/controllers/$1',
    '^@services/(.*)$': '<rootDir>/server/src/services/$1',
    '^@routes/(.*)$': '<rootDir>/server/src/routes/$1',
    '^@models/(.*)$': '<rootDir>/server/src/models/$1',
    '^@middleware/(.*)$': '<rootDir>/server/src/middleware/$1',
    '^@utils/(.*)$': '<rootDir>/server/src/utils/$1',
    '^@websocket/(.*)$': '<rootDir>/server/src/websocket/$1',
    '^@types/(.*)$': '<rootDir>/server/src/types/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/server/tests/setup.ts'],
  testTimeout: 30000,
  transformIgnorePatterns: [
    '/node_modules/(?!(onnxruntime-node)/)',
  ],
};