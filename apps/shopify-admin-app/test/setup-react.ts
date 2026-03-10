/**
 * Setup file for React component tests
 * Loads testing-library utilities and custom matchers
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Shopify App Bridge if needed
(global as any).shopify = {
  config: {
    apiKey: 'test-api-key',
    host: 'test-host',
  },
};
