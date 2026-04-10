import { cn } from '@/lib/utils';

/**
 * Animated shimmer loading placeholder for individual data sections.
 * Use instead of full-page skeletons so other sections remain interactive.
 */
export function LoadingSection({
  lines = 4,
  className,
  label,
}: {
  lines?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn('bg-card rounded-xl border border-border/50 p-4 space-y-3 animate-fade-in', className)}>
      {label && (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-muted animate-pulse" />
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
        </div>
      )}
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded bg-muted animate-pulse"
          style={{
            width: `${65 + Math.random() * 35}%`,
            animationDelay: `${i * 100}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function LoadingKPIs({ count = 4 }: { count?: number }) {
  return (
    <div className={cn('grid gap-3', count <= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-5')}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-card rounded-lg border border-border/40 p-3 flex items-center gap-3 animate-fade-in"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="w-9 h-9 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-16 rounded bg-muted animate-pulse" />
            <div className="h-5 w-20 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingTable({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-card rounded-lg border border-border/50 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
        <div className="h-4 w-32 rounded bg-muted animate-pulse" />
        <div className="h-4 w-16 rounded bg-muted animate-pulse" />
      </div>
      {/* Rows */}
      <div className="p-2 space-y-1">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2 py-1.5"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className="h-4 rounded bg-muted animate-pulse"
                style={{ flex: j === 1 ? 2 : 1 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadingCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-card rounded-xl border border-border/50 p-4 space-y-3 animate-fade-in"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
          <div className="flex gap-2">
            <div className="h-5 w-16 rounded bg-muted animate-pulse" />
            <div className="h-5 w-20 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
