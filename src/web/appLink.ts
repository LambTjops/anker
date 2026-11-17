/**
 * Music apps whose links Android can hand straight to the installed app. Each host has
 * published an assetlinks.json naming this package.
 */
const ANDROID_APPS: Record<string, string> = {
  'app.endel.io': 'com.endel.endel',
  'endel.io': 'com.endel.endel',
  'my.brain.fm': 'com.brainfm.app',
};

const isAndroid = () => /Android/i.test(navigator.userAgent);

/**
 * On Android, a link to a known app becomes an intent: that opens the app if it's
 * installed, and the same page in the browser if it isn't. Everywhere else, the link as is.
 */
export function appLink(url: string): { href: string; external: boolean } {
  if (!isAndroid()) return { href: url, external: true };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { href: url, external: true };
  }
  const pkg = ANDROID_APPS[u.hostname];
  if (!pkg) return { href: url, external: true };
  const fallback = encodeURIComponent(url);
  const href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=${pkg};S.browser_fallback_url=${fallback};end`;
  // An intent leaves the browser by itself; a new tab would only be left empty.
  return { href, external: false };
}
