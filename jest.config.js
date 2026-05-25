'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 60000,
  forceExit: true,
  collectCoverageFrom: [
    'controllers/**/*.js',
    'services/**/*.js',
    'validators/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'public/js/**/*.js',
    '!public/js/**/*.min.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
};
