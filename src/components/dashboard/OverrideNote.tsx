import type { z } from "zod";
import type { Override as OverrideSchema } from "@/lib/schema"

type OverrideT = z.infer<typeof OverrideSchema>

type OverrideNoteProps = {
  override: OverrideT
}

/**
 * A human-authored note, visually distinct from every generated section
 * on the card — a dashed left border and a serif-free "handwritten memo"
 * framing (the author line), so it never reads as machine output.
 */
export function OverrideNote({ override }: OverrideNoteProps) {
  return (
    <div className="rounded-lg border-l-2 border-dashed border-foreground/30 bg-muted/60 px-3 py-2 text-sm">
      <p className="m-0 italic">&ldquo;{override.note}&rdquo;</p>
      <p className="m-0 mt-1 text-xs text-muted-foreground">
        — {override.author}, note expires {override.expires}
      </p>
    </div>
  )
}
