"use client";

export function SkeletonCard() {
  return (
    <div
      className="rounded-2xl p-4 animate-pulse"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-2/3 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-2 w-1/2 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
        </div>
      </div>
      <div className="mt-3 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.03)" }} />
    </div>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonHeader() {
  return (
    <div className="animate-pulse flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
      <div className="space-y-1.5">
        <div className="h-3 w-24 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-2 w-16 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
      </div>
    </div>
  );
}
