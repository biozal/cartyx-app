'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/config/passport.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};
