import { Skeleton } from '@/components/ui/skeleton';

export function KPISkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-card rounded-xl border p-5">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={`bg-card rounded-xl border p-5 ${className || ''}`}>
      <Skeleton className="h-5 w-40 mb-4" />
      <Skeleton className="h-[250px] w-full rounded" />
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="bg-card rounded-xl border p-5">
      <Skeleton className="h-5 w-40 mb-4" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-3 mb-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 flex-1" />
        </div>
      ))}
    </div>
  );
}
