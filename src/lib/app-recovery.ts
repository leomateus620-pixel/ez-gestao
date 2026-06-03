const ASSET_LOAD_ERROR_RE = /(Loading chunk|ChunkLoadError|Failed to fetch dynamically imported|error loading dynamically imported|Importing a module script failed)/i;
const RECOVERY_KEY = 'ez-app-asset-recovery-at';
const RECOVERY_WINDOW_MS = 30_000;

let recoveryInFlight = false;

function getErrorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  if (reason && typeof reason === 'object' && 'message' in reason) {
    return String((reason as { message?: unknown }).message ?? '');
  }
  return '';
}

function isAssetUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.href);
    return url.pathname.includes('/assets/');
  } catch {
    return value.includes('/assets/');
  }
}

function canAttemptRecovery() {
  try {
    const lastRecovery = Number(sessionStorage.getItem(RECOVERY_KEY) ?? 0);
    if (lastRecovery && Date.now() - lastRecovery < RECOVERY_WINDOW_MS) return false;
    sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

async function clearBrowserCaches() {
  if (!('caches' in window)) return;
  try {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  } catch (err) {
    console.warn('[app] cache cleanup failed before asset recovery', err);
  }
}

async function recoverFromAssetLoadError(reason: unknown) {
  if (recoveryInFlight || !canAttemptRecovery()) return;
  recoveryInFlight = true;
  console.warn('[app] asset load failed; refreshing app shell', reason);
  await clearBrowserCaches();
  window.location.reload();
}

export function registerAppRecoveryHandlers() {
  if (typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    void recoverFromAssetLoadError(event);
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (ASSET_LOAD_ERROR_RE.test(getErrorMessage(event.reason))) {
      event.preventDefault();
      void recoverFromAssetLoadError(event.reason);
    }
  });

  window.addEventListener('error', (event) => {
    const target = event.target;
    if (
      (target instanceof HTMLScriptElement && isAssetUrl(target.src)) ||
      (target instanceof HTMLLinkElement && isAssetUrl(target.href)) ||
      ASSET_LOAD_ERROR_RE.test(event.message)
    ) {
      event.preventDefault();
      void recoverFromAssetLoadError(event.error ?? event.message);
    }
  }, true);
}
