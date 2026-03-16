// MapBootstrapProvider is now hoisted to the root layout so TabShell
// can keep MapClient persistently mounted across all tab routes.
export default function MapLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
