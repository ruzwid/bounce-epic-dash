// src/lib/dashboard/pageTitle.ts
import { epicTitle } from "./appConfig.ts";

/**
 * A child page's document title.
 *
 * The epic's name is the anchor, and a dated URL appends which snapshot it
 * is: "Reviews — WPP at Scale" sitting in a tab reads as the live review
 * queue, which is wrong and quietly misleading when the page is a record
 * of three weeks ago. Only the dated half of the site carries the suffix,
 * so the everyday case stays short.
 */
export function pageTitle(page: string, epic: string, date?: string): string {
  const base = `${page} — ${epicTitle(epic)}`;
  return date ? `${base} (${date})` : base;
}
