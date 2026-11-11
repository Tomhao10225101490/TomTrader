/** Clears only browser preferences; never deletes server data or the live client identity. */
export function clearAllUserDataLocal(): void {
  try {
    localStorage.removeItem('tomtrader.prefs.v1');
  } catch {
    /* private mode */
  }
}
