import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';

// Vitest globals are disabled, so Testing Library cannot register its automatic cleanup.
afterEach(() => {
  cleanup();
});
