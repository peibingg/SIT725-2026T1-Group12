'use strict';

const { execSync } = require('child_process');

function dockerAvailable() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('Docker', () => {
  const skip = !dockerAvailable();

  (skip ? it.skip : it)('docker build succeeds', () => {
    execSync('docker build -t task-marketplace:test .', {
      cwd: require('path').join(__dirname, '..'),
      stdio: 'pipe',
      timeout: 300000,
    });
  }, 300000);
});
