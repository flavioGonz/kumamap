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

// ── Camera grid skeleton ──
export function SkeletonCameraGrid({ count = 4, cols = 2 }: { count?: number; cols?: number }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg overflow-hidden" style={{ aspectRatio: "16/9", background: "rgba(255,255,255,0.03)" }}>
          <div className="w-full h-full relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-6 w-6 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
            </div>
            <div className="absolute bottom-0 inset-x-0 h-6 px-2 flex items-center" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="h-2 w-16 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Alert/timeline skeleton ──
export function SkeletonAlertList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="h-8 w-8 rounded-lg shrink-0" style={{ background: "rgba(255,255,255,0.04)" }} />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-3/4 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="h-2 w-1/2 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
          </div>
          <div className="h-4 w-10 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
      ))}
    </div>
  );
}

// ── KPI cards skeleton ──
export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="h-5 w-8 rounded mb-1" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-2 w-12 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
        </div>
      ))}
    </div>
  );
}

// ── Settings skeleton ──
export function SkeletonSettings() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl p-4 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="space-y-1.5">
              <div className="h-3 w-28 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="h-2 w-40 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
            </div>
          </div>
          <div className="h-6 w-11 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
      ))}
    </div>
  );
}

// ── Rack list skeleton ──
export function SkeletonRackList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center gap-3">
            <div className="h-12 w-8 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/2 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="flex gap-2">
                <div className="h-2 w-14 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
                <div className="h-2 w-10 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Status banner skeleton ──
export function SkeletonBanner() {
  return (
    <div className="animate-pulse rounded-2xl p-3 flex items-center gap-3 mx-4 mt-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="h-10 w-10 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-2 w-24 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
      </div>
    </div>
  );
}

// ── Mini stat row skeleton ──
export function SkeletonStatsRow() {
  return (
    <div className="px-4 mt-2 flex gap-2 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex-1 rounded-xl px-2.5 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="h-3 w-8 rounded mb-1" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-2 w-12 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
        </div>
      ))}
    </div>
  );
}
