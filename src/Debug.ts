// Debug helper for controlled console logging

const DEBUG_LOCAL_STORAGE_KEY = 'goblox:debugEnabled';

function readInitialDebugFlag(): boolean {
	// Prefer explicit user toggle saved in localStorage
	try {
		const saved = localStorage.getItem(DEBUG_LOCAL_STORAGE_KEY);
		if (saved === 'true') return true;
		if (saved === 'false') return false;
	} catch {
		// Ignore storage errors (e.g., privacy mode)
	}

	// Fallback: enable in development builds (Vite)
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const env: any = (typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined);
		if (env && env.DEV) return true;
	} catch {
		// No-op if env is unavailable
	}

	return false;
}

let debugEnabled = readInitialDebugFlag();

export function setDebugEnabled(enabled: boolean): void {
	debugEnabled = enabled;
	try {
		localStorage.setItem(DEBUG_LOCAL_STORAGE_KEY, String(enabled));
	} catch {
		// Ignore storage errors
	}
}

export function isDebugEnabled(): boolean {
	return debugEnabled;
}

export function debugLog(...args: unknown[]): void {
	if (!debugEnabled) return;
	const timestamp = new Date().toISOString();
	// Use console.log to comply with request; prepend a timestamp and tag
	// eslint-disable-next-line no-console
	console.log(`[DEBUG ${timestamp}]`, ...args);
}

export const Debug = {
	log: debugLog,
	enabled: (): boolean => isDebugEnabled(),
	setEnabled: (enabled: boolean): void => setDebugEnabled(enabled),
};


