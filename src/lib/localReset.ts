/** Clears the browser-side preference mirror. Server data is reset by the API. */
export function clearAllUserDataLocal(): void {
  try {
    localStorage.removeItem('tomtrader.prefs.v1');
    sessionStorage.removeItem('tomtrader.client');
  } catch {
    /* private mode */
  }
}
