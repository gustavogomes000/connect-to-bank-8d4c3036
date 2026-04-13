import { cn } from '@/lib/utils';

/**
 * Animated page-level loading indicator used as Suspense fallback.
 * Shows a pulsing skeleton layout that matches the app's structure.
 */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* KPI row skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-card rounded-lg border border-border/40 p-4 flex items-start gap-3"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="w-10 h-10 rounded-lg bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-16 rounded bg-muted animate-pulse" />
              <div className="h-6 w-24 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="bg-card rounded-xl border border-border/40 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-40 rounded bg-muted animate-pulse" />
          <div className="h-5 w-20 rounded bg-muted animate-pulse" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
            <div className="h-4 flex-1 rounded bg-muted animate-pulse" style={{ maxWidth: `${60 + Math.random() * 30}%` }} />
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>

      {label && (
        <p className="text-xs text-muted-foreground text-center animate-pulse">{label}</p>
      )}
    </div>
  );
}
