interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-bg-surface border border-border rounded-lg p-5 space-y-3">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

export function SkeletonStatRow() {
  return (
    <div className="flex gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-bg-surface border border-border rounded-lg px-4 py-3 flex-1">
          <Skeleton className="h-7 w-12 mb-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="space-y-6 p-6">
      <SkeletonStatRow />
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
