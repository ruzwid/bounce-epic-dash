// src/lib/dashboard/personName.ts

/** The first word of a name — "Ruzzell Widjaja" -> "Ruzzell". A login with
 *  no config.yaml entry ("Madjda", "chatgpt-codex-connector") has no first
 *  name to take, so it passes through whole. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}
