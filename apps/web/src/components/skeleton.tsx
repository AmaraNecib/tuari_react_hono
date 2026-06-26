import { cn } from "@/lib/utils"

/* ─── Base ─────────────────────────────────────────── */

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-ink/7",
        className,
      )}
    />
  )
}

function ShimmerLine({ className }: { className?: string }) {
  return <Shimmer className={cn("h-3 w-full", className)} />
}

function ShimmerBlock({ className }: { className?: string }) {
  return <Shimmer className={cn("h-10 w-full", className)} />
}

function ShimmerAvatar({ className }: { className?: string }) {
  return <Shimmer className={cn("size-8 rounded-full", className)} />
}

/* ─── Dashboard skeleton ────────────────────────────── */

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 p-7" role="status" aria-label="loading dashboard">
      {/* PageHeader */}
      <div className="space-y-4">
        <ShimmerLine className="w-24 h-3" />
        <ShimmerLine className="w-48 h-8" />
      </div>

      {/* StatBand 4-col */}
      <div className="grid grid-cols-2 md:grid-cols-4 border border-line rounded-xl overflow-hidden bg-surface">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn("px-5 py-4 space-y-2", i > 0 && "border-s border-line")}
          >
            <ShimmerLine className="w-16 h-3" />
            <ShimmerLine className="w-12 h-7" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── List page skeleton (employees, projects, etc.) ── */

export function ListPageSkeleton({ rowCount = 6 }: { rowCount?: number }) {
  return (
    <div className="p-7 space-y-6" role="status" aria-label="loading list">
      {/* PageHeader */}
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <ShimmerLine className="w-32 h-9" />
          <ShimmerLine className="w-56 h-3" />
        </div>
        <ShimmerBlock className="w-28 h-9 rounded-xl" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-line bg-bg-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <ShimmerLine key={i} className={cn("h-3", i === 0 ? "w-32" : i === 5 ? "w-16 mr-0 ms-auto" : "w-20")} />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: rowCount }).map((_, row) => (
          <div
            key={row}
            className={cn(
              "flex items-center gap-4 px-4 py-3",
              row < rowCount - 1 && "border-b border-line",
            )}
          >
            <ShimmerLine className="w-32 h-3" />
            <ShimmerLine className="w-16 h-3" />
            <ShimmerLine className="w-24 h-3" />
            <ShimmerLine className="w-20 h-3" />
            <ShimmerLine className="w-12 h-3" />
            <div className="flex gap-2 me-0 ms-auto">
              <ShimmerBlock className="w-16 h-7 rounded-lg" />
              <ShimmerBlock className="w-16 h-7 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Detail page skeleton (employee, project, etc.) ── */

export function DetailPageSkeleton() {
  return (
    <div className="p-7 space-y-6" role="status" aria-label="loading detail">
      {/* Back link */}
      <ShimmerLine className="w-20 h-3" />

      {/* PageHeader with action */}
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-3">
          <ShimmerLine className="w-16 h-3" />
          <ShimmerLine className="w-52 h-8" />
          <ShimmerLine className="w-36 h-3" />
        </div>
        <ShimmerBlock className="w-28 h-9 rounded-xl" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line">
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerBlock key={i} className={cn("h-9 w-24 rounded-t-lg rounded-b-none", i === 0 && "bg-ink/10")} />
        ))}
      </div>

      {/* Content cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-5 space-y-3">
            <ShimmerLine className="w-24 h-4" />
            <ShimmerLine className="w-full h-3" />
            <ShimmerLine className="w-3/4 h-3" />
            <ShimmerLine className="w-1/2 h-3" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Settings skeleton ─────────────────────────────── */

export function SettingsPageSkeleton() {
  return (
    <div className="p-7 space-y-6" role="status" aria-label="loading settings">
      <ShimmerLine className="w-32 h-9" />

      <div className="rounded-xl border border-line bg-surface p-6 space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <ShimmerLine className="w-20 h-3" />
            <ShimmerBlock className="h-10 w-full rounded-xl" />
          </div>
        ))}
        <ShimmerBlock className="w-28 h-10 rounded-xl" />
      </div>
    </div>
  )
}

/* ─── Simple content skeleton (transactions, etc.) ──── */

export function ContentSkeleton({ lines = 8 }: { lines?: number }) {
  return (
    <div className="p-7 space-y-4" role="status" aria-label="loading content">
      <ShimmerLine className="w-32 h-9" />
          <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <ShimmerLine key={i} className={cn(i % 3 === 0 ? "w-full" : i % 3 === 1 ? "w-5/6" : "w-2/3")} />
        ))}
      </div>
    </div>
  )
}

/* ─── App shell skeleton (for initial load) ─────────── */

export function AppShellSkeleton() {
  return (
    <div className="flex h-screen" role="status" aria-label="loading application">
      {/* Sidebar skeleton */}
      <aside className="w-[var(--sidebar-w)] flex flex-col bg-bg-2 border-e border-line">
        <div className="flex items-center gap-3 px-5 border-b border-line" style={{ height: "var(--header-h)" }}>
          <Shimmer className="size-[1.375rem] rounded-[0.3125rem]" />
          <ShimmerLine className="w-16 h-4" />
        </div>
        <nav className="flex-1 p-3 space-y-6 overflow-hidden" aria-label="navigation">
          {Array.from({ length: 3 }).map((_, group) => (
            <div key={group} className="space-y-1">
              <ShimmerLine className="w-20 h-3 ms-3" />
              {Array.from({ length: group === 0 ? 2 : group === 1 ? 5 : 2 }).map((_, item) => (
                <div key={item} className="flex items-center gap-3 px-3 py-[0.375rem]">
                  <Shimmer className="size-4 rounded" />
                  <ShimmerLine className="w-16 h-3" />
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-line px-3 py-3 flex items-center gap-3">
          <ShimmerAvatar />
          <div className="flex-1 space-y-1">
            <ShimmerLine className="w-24 h-3" />
            <ShimmerLine className="w-16 h-2" />
          </div>
        </div>
      </aside>

      {/* Main area skeleton */}
      <div className="flex-1 flex flex-col bg-bg">
        <header
          className="flex items-center gap-3 px-4 border-b border-line bg-bg flex-shrink-0"
          style={{ height: "var(--header-h)" }}
        >
          <Shimmer className="size-[1.875rem] rounded-[0.4375rem]" />
          <ShimmerLine className="w-32 h-4" />
          <div className="flex-1" />
          <Shimmer className="size-[1.875rem] rounded-[0.4375rem]" />
          <Shimmer className="size-[1.875rem] rounded-[0.4375rem]" />
        </header>

        <main className="flex-1 overflow-auto">
          <Shimmer className="mx-7 mt-7 h-48 w-auto rounded-xl" />
        </main>
      </div>
    </div>
  )
}

/* ─── Auth screen skeleton ──────────────────────────── */

export function AuthScreenSkeleton() {
  return (
    <main className="flex h-screen items-center justify-center bg-bg" role="status" aria-label="loading auth">
      <div className="w-full max-w-lg p-8 space-y-6">
        <div className="space-y-3 text-center">
          <ShimmerLine className="w-32 h-6 mx-auto" />
          <ShimmerLine className="w-64 h-3 mx-auto" />
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
          <div className="space-y-2">
            <ShimmerLine className="w-16 h-3" />
            <ShimmerBlock className="h-10 w-full rounded-xl" />
          </div>
          <ShimmerBlock className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </main>
  )
}
