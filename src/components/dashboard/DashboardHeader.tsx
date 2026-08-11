import { useState } from "react"
import type { z } from "zod"
import type { StatusSnapshot as StatusSnapshotSchema } from "@/lib/schema"
import { buildSlackSummary } from "@/lib/dashboard/slack"
import { Button } from "@/components/ui/button"
import ThemeToggle from "@/components/ThemeToggle"
import { StaleBanner } from "./StaleBanner"

type StatusSnapshotT = z.infer<typeof StatusSnapshotSchema>

type DashboardHeaderProps = {
  snapshot: StatusSnapshotT
  now: Date
}

export function DashboardHeader({ snapshot, now }: DashboardHeaderProps) {
  const [copied, setCopied] = useState(false)

  async function copySlackSummary() {
    await navigator.clipboard.writeText(buildSlackSummary(snapshot))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <h1 className="m-0 text-lg font-semibold">{snapshot.epic.title}</h1>
          <p className="m-0 text-xs text-muted-foreground">
            <span className="font-mono-data">{snapshot.epic.key}</span> · snapshot{" "}
            <span className="font-mono-data">{snapshot.date}</span> · target{" "}
            <span className="font-mono-data">{snapshot.epic.targetDate ?? "no target date set"}</span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={copySlackSummary}>
            {copied ? "Copied" : "Copy Slack summary"}
          </Button>
          <ThemeToggle />
        </div>
      </div>
      <StaleBanner generatedAt={snapshot.generatedAt} now={now} />
    </header>
  )
}
