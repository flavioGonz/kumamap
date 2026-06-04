"use client";

import React from "react";

/** Skeleton for a single map card row in the list */
function MapCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="grid grid-cols-[1fr_90px_90px_100px_120px_130px_70px_165px] gap-2 items-center px-5 py-3"
      style={{
        borderBottom: "1px solid var(--glass-border)",
        animationDelay: `${index * 80}ms`,
      }}
    >
      {/* Name */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="skeleton-pulse h-9 w-9 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-1.5">
          <div className="skeleton-pulse h-3.5 rounded" style={{ width: `${55 + (index % 3) * 15}%` }} />
          <div className="skeleton-pulse h-2.5 rounded" style={{ width: "35%" }} />
        </div>
      </div>

      {/* Type */}
      <div className="flex items-center gap-1.5">
        <div className="skeleton-pulse h-3.5 w-3.5 rounded-full" />
        <div className="skeleton-pulse h-3 w-12 rounded" />
      </div>

      {/* Nodes */}
      <div className="flex items-center gap-1">
        <div className="skeleton-pulse h-3 w-6 rounded" />
        <div className="skeleton-pulse h-3 w-6 rounded" />
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <div className="skeleton-pulse h-2 w-2 rounded-full" />
        <div className="skeleton-pulse h-3 w-5 rounded" />
        <div className="skeleton-pulse h-2 w-2 rounded-full" />
        <div className="skeleton-pulse h-3 w-5 rounded" />
      </div>

      {/* Group */}
      <div>
        <div className="skeleton-pulse h-5 w-16 rounded-lg" />
      </div>

      {/* Updated */}
      <div className="flex items-center gap-1.5">
        <div className="skeleton-pulse h-3 w-3 rounded-full" />
        <div className="skeleton-pulse h-3 w-20 rounded" />
      </div>

      {/* View */}
      <div>
        <div className="skeleton-pulse h-6 w-8 rounded-lg" />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton-pulse h-6 w-6 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the entire map list page */
export function MapListSkeleton() {
  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="skeleton-pulse h-10 w-10 rounded-xl" />
          <div className="space-y-1.5">
            <div className="skeleton-pulse h-5 w-28 rounded" />
            <div className="skeleton-pulse h-2.5 w-40 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton-pulse h-8 w-8 rounded-lg" />
          ))}
          <div className="skeleton-pulse h-8 w-20 rounded-lg" />
        </div>
      </div>

      {/* Search bar skeleton */}
      <div className="flex items-center gap-3 mb-4">
        <div className="skeleton-pulse h-10 w-80 rounded-xl" />
        <div className="skeleton-pulse h-9 w-52 rounded-xl" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--glass-border)" }}>
        {/* Table header */}
        <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid var(--glass-border)" }}>
          {[100, 60, 50, 65, 80, 90, 45, 110].map((w, i) => (
            <div key={i} className="skeleton-pulse h-3 rounded" style={{ width: w }} />
          ))}
        </div>

        {/* Table rows */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <MapCardSkeleton key={i} index={i} />
        ))}
      </div>

      {/* Footer skeleton */}
      <div className="mt-3 flex items-center justify-between">
        <div className="skeleton-pulse h-3 w-32 rounded" />
        <div className="skeleton-pulse h-3 w-64 rounded" />
      </div>
    </div>
  );
}

/** Skeleton for the map editor page */
export function MapEditorSkeleton() {
  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Toolbar skeleton */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
        <div
          className="flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5"
          style={{
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            backdropFilter: "blur(24px)",
          }}
        >
          <div className="skeleton-pulse h-7 w-14 rounded-xl" />
          <div style={{ width: 1, height: 20, background: "var(--glass-border)" }} />
          <div className="skeleton-pulse h-4 w-28 rounded" />
          <div style={{ width: 1, height: 20, background: "var(--glass-border)" }} />
          <div className="skeleton-pulse h-7 w-36 rounded-lg" />
          <div style={{ width: 1, height: 20, background: "var(--glass-border)" }} />
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-pulse h-7 w-16 rounded-xl" />
          ))}
          <div style={{ width: 1, height: 20, background: "var(--glass-border)" }} />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-pulse h-7 w-7 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Map canvas placeholder */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="skeleton-pulse h-12 w-12 rounded-2xl" />
          <div className="skeleton-pulse h-3 w-32 rounded" />
        </div>
      </div>

      {/* Right sidebar skeleton */}
      <div
        className="absolute top-16 right-3 bottom-3 w-10 rounded-2xl flex flex-col items-center gap-2 py-3"
        style={{
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          backdropFilter: "blur(24px)",
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton-pulse h-7 w-7 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
