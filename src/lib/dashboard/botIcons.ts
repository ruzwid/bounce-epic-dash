// src/lib/dashboard/botIcons.ts
import type { IconType } from "react-icons"
import { SiGithubcopilot } from "react-icons/si"
import { BsOpenai } from "react-icons/bs"

/** GitHub's own review-bot accounts render a recognizable brand mark
 *  instead of the usual photo/initials — their `github.com/<login>.png`
 *  avatars are generic app icons that don't read as "who reviewed this"
 *  at a glance the way a person's face does. */
export const BOT_ICONS: Record<string, IconType> = {
  "copilot-pull-request-reviewer": SiGithubcopilot,
  "chatgpt-codex-connector": BsOpenai,
}
