import { useState } from "react"
import { cn } from "@/lib/utils"

type AvatarProps = {
  /** GitHub login. Null when config.yaml doesn't map this person to one —
   *  the initials fallback is then the only thing that can be drawn. */
  login: string | null
  /** Display name. Used for initials, the alt text, and the colour seed. */
  name: string
  /** Rendered size in px. */
  size?: number
  className?: string
}

/** Two letters from a name: "Ruzzell Widjaja" -> "RW", "gelbh" -> "GE". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "??"
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase()
}

/** Deterministic swatch for the fallback, drawn from the status family
 *  rather than a new palette — an avatar is decoration and must not
 *  introduce a hue the rest of the page doesn't already use.
 *
 *  --status-shipped is deliberately excluded: it now aliases --primary
 *  (see styles.css), whose dark-theme value is tuned for dark text on
 *  top, not the white initials every swatch here renders. */
const SWATCHES = [
  "var(--status-staged)",
  "var(--status-in-review)",
  "var(--status-in-progress)",
  "var(--status-blocked)",
] as const

function swatchFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return SWATCHES[hash % SWATCHES.length]!
}

/**
 * A person's GitHub profile picture, falling back to initials.
 *
 * `github.com/<login>.png` redirects to the user's current avatar, so
 * there's nothing to store or keep in sync — but it does mean the page
 * makes a request to github.com per distinct person. Fine for an internal
 * dashboard; the fallback covers offline, a private account, or a login
 * that no longer exists, since a 404 fires onError like any other failure.
 *
 * Circular on purpose, where the rest of the interface is squircled:
 * these are portraits, and every product that shows them — GitHub, JIRA,
 * Slack — crops them round. A squircle here would read as a bug.
 */
export function Avatar({ login, name, size = 20, className }: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const showImage = login !== null && !failed

  return (
    // Decorative throughout: every caller renders the person's name as text
    // right beside this, so an alt of the same name would just make screen
    // readers say it twice.
    <span
      aria-hidden="true"
      className={cn("relative inline-flex shrink-0 overflow-hidden rounded-full", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="flex size-full items-center justify-center font-medium text-white"
        style={{ background: swatchFor(name), fontSize: Math.max(8, Math.round(size * 0.42)) }}
      >
        {initials(name)}
      </span>
      {showImage ? (
        <img
          // Ask GitHub for a 2x asset so the avatar stays sharp on retina
          // without downloading a 460px original for a 20px circle.
          src={`https://github.com/${encodeURIComponent(login)}.png?size=${size * 2}`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </span>
  )
}
