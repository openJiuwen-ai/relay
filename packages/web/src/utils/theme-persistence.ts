/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type ThemeType = 'warm' | 'business' | 'dark';

export const DEFAULT_THEME: ThemeType = 'business';
export const THEME_STORAGE_KEY = 'office-claw-theme';
/** Legacy key from pre–OfficeClaw branding; read once and migrated to {@link THEME_STORAGE_KEY}. */
const LEGACY_THEME_STORAGE_KEY = 'clowder-ai-theme';
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function normalizeThemeValue(value: string | null | undefined): ThemeType | null {
  if (!value) return null;
  if (value === 'default') return DEFAULT_THEME;
  return value === 'warm' || value === 'business' || value === 'dark' ? value : null;
}

function readThemeFromCookieKey(cookieSource: string, key: string): ThemeType | null {
  const prefix = `${key}=`;
  for (const segment of cookieSource.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed.startsWith(prefix)) continue;

    try {
      return normalizeThemeValue(decodeURIComponent(trimmed.slice(prefix.length)));
    } catch {
      return null;
    }
  }

  return null;
}

export function readThemeFromCookieString(cookieSource: string | null | undefined): ThemeType | null {
  if (!cookieSource) return null;
  return (
    readThemeFromCookieKey(cookieSource, THEME_STORAGE_KEY) ??
    readThemeFromCookieKey(cookieSource, LEGACY_THEME_STORAGE_KEY)
  );
}

export function readThemeFromDocument(): ThemeType | null {
  if (typeof document !== 'object') return null;
  return normalizeThemeValue(document.documentElement.dataset.uiTheme);
}

export function readThemeFromBrowserStorage(): ThemeType | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const primary = localStorage.getItem(THEME_STORAGE_KEY);
    const fromPrimary = normalizeThemeValue(primary);
    if (fromPrimary) return fromPrimary;

    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    const fromLegacy = normalizeThemeValue(legacy);
    if (fromLegacy) {
      localStorage.setItem(THEME_STORAGE_KEY, fromLegacy);
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      return fromLegacy;
    }
    return null;
  } catch {
    return null;
  }
}

export function readThemeFromBrowserCookie(): ThemeType | null {
  if (typeof document !== 'object') return null;
  return readThemeFromCookieString(document.cookie);
}

function writeThemeToBrowserStorage(theme: ThemeType) {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures and keep runtime theme usable.
  }
}

function writeThemeToBrowserCookie(theme: ThemeType) {
  if (typeof document !== 'object') return;

  try {
    document.cookie = `${LEGACY_THEME_STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie =
      `${THEME_STORAGE_KEY}=${encodeURIComponent(theme)}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // Ignore cookie failures and keep runtime theme usable.
  }
}

export function persistTheme(theme: ThemeType) {
  writeThemeToBrowserStorage(theme);
  writeThemeToBrowserCookie(theme);
}

export function resolvePersistedTheme(): ThemeType {
  const cookieTheme = readThemeFromBrowserCookie();
  if (cookieTheme) {
    persistTheme(cookieTheme);
    return cookieTheme;
  }

  const storageTheme = readThemeFromBrowserStorage();
  if (storageTheme) {
    persistTheme(storageTheme);
    return storageTheme;
  }

  return readThemeFromDocument() ?? DEFAULT_THEME;
}

export function buildThemeBootstrapScript(): string {
  const primary = JSON.stringify(THEME_STORAGE_KEY);
  const legacy = JSON.stringify(LEGACY_THEME_STORAGE_KEY);
  return `(() => {
    try {
      var key = ${primary};
      var legacyKey = ${legacy};
      var defaultTheme = ${JSON.stringify(DEFAULT_THEME)};
      var theme = '';
      var cookieParts = document.cookie ? document.cookie.split(';') : [];

      function readFromCookie(k) {
        var prefix = k + '=';
        for (var i = 0; i < cookieParts.length; i += 1) {
          var part = cookieParts[i] ? cookieParts[i].trim() : '';
          if (part.indexOf(prefix) !== 0) continue;
          try {
            return decodeURIComponent(part.slice(prefix.length));
          } catch (_) {
            return '';
          }
        }
        return '';
      }

      theme = readFromCookie(key) || readFromCookie(legacyKey);
      if (!theme) {
        try {
          theme = localStorage.getItem(key) || localStorage.getItem(legacyKey) || '';
        } catch (_) {
          theme = '';
        }
      }

      if (theme !== 'warm' && theme !== 'business' && theme !== 'dark') {
        theme = theme === 'default' ? defaultTheme : (document.documentElement.dataset.uiTheme || defaultTheme);
      }

      document.documentElement.dataset.uiTheme = theme;

      try {
        localStorage.removeItem(legacyKey);
        localStorage.setItem(key, theme);
      } catch (_) {}

      try {
        document.cookie = legacyKey + '=; path=/; max-age=0; SameSite=Lax';
      } catch (_) {}

      document.cookie = key + '=' + encodeURIComponent(theme) + '; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax';
    } catch (_) {
      document.documentElement.dataset.uiTheme = ${JSON.stringify(DEFAULT_THEME)};
    }
  })();`;
}
