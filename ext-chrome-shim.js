/** Some engines expose only `browser`; map to `chrome` for shared content scripts. */
if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
  globalThis.chrome = globalThis.browser;
}
