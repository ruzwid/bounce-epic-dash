import { isStale } from "@/lib/dashboard/staleness"
import { Callout } from "./Callout"

type StaleBannerProps = {
  generatedAt: string
  /** Passed in, never `new Date()` internally — keeps this SSR-safe and
   *  testable, and means the same instant is used everywhere on a page. */
  now: Date
}

/** Renders nothing when the snapshot is fresh — only a genuinely stale
 *  snapshot gets a banner, and it's prominent (severity "risk") when it
 *  does, per the goal's "Stale banner if generatedAt > 26h old — prominent." */
export function StaleBanner({ generatedAt, now }: StaleBannerProps) {
  if (!isStale(generatedAt, now)) return null

  const ageHours = Math.floor((now.getTime() - new Date(generatedAt).getTime()) / (1000 * 60 * 60))

  return (
    <div className="flex items-stretch gap-2">
      <span aria-hidden="true" className="w-1 shrink-0 scale-y-75 rounded-full bg-[var(--status-blocked)]" />
      <Callout
        callout={{
          type: "drift",
          severity: "risk",
          message: `This snapshot is ${ageHours}h old — data may be out of date.`,
          refs: [],
        }}
        className="flex-1 rounded-lg border-l-0 bg-muted/60 px-3"
      />
    </div>
  )
}
