/** Hide the native keyboard — blur active element, works on web and native */
export function hideKeyboard(): void {
  (document.activeElement as HTMLElement)?.blur();
}
