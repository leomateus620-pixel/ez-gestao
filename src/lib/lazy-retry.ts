import { lazy, type ComponentType } from 'react';

/**
 * React.lazy wrapper that retries the dynamic import a few times before
 * giving up. Handles the common "chunk failed to load" error that happens
 * when a new deploy invalidates the previous bundle while the user still
 * has the old shell open.
 */
export function lazyRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
  delayMs = 500,
) {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await factory();
      } catch (error) {
        lastError = error;
        console.error(`[lazy] chunk import failed (attempt ${attempt + 1}/${retries + 1})`, error);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
        }
      }
    }
    throw lastError;
  });
}