import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import type { DashboardSearch } from "@/lib/dashboard/search"
import { useShell } from "./ShellContext"

export type ShellPage =
  | "today"
  | "week"
  | "attention"
  | "reviews"
  | "people"
  | "signoff"
  | "scope"
  | "config"
  | "feature"
  | "milestone"

type ShellLinkProps = {
  page: ShellPage
  /** Required when `page` is "feature" — the feature slug, e.g. "f1-1". */
  code?: string
  /** Required when `page` is "milestone" — the milestone id, e.g. "m1". */
  id?: string
  className?: string
  /** Applied when this link matches the current route. */
  activeProps?: Record<string, unknown>
  /** Filters to set on arrival, merged over whatever is already in the
   *  URL — e.g. the People page linking at "everything flagged for this
   *  person" on the Needs attention page. Omitted, the reader's current
   *  filters carry across the navigation untouched. */
  search?: Partial<DashboardSearch>
  title?: string
  children: ReactNode
}

/**
 * One link component for the whole shell.
 *
 * Every route lives under `/$epic/{-$date}`, whose date segment is
 * optional, so "which snapshot am I browsing" is carried entirely by one
 * param: `date: undefined` is the latest page and `date: "2026-08-17"` is
 * that day's. Passing the shell's own date straight through is what keeps
 * a reader inside the snapshot they're reading as they navigate — before
 * the two route trees were merged, this file said all of it twice, once
 * per tree, and the two halves had to be kept in step by hand.
 *
 * The branches are written out rather than computed because TanStack's
 * `to` is a literal union — building the path as a template string would
 * throw away the type checking that makes a typo a build error.
 */
export function ShellLink({ page, code, id, className, activeProps, search, title, children }: ShellLinkProps) {
  const { epic, date: shellDate } = useShell()
  // The shell stores "latest" as null; the router wants the param absent.
  const date = shellDate ?? undefined

  const shared = {
    className,
    activeProps,
    title,
    // Merged onto whatever is already in the URL rather than replacing it,
    // so following one of these links doesn't silently clear the reader's
    // milestone or text filter. Typed loosely because TanStack infers a
    // per-route updater signature that a component shared across ten
    // routes can't name.
    ...(search ? { search: (prev: Record<string, unknown>) => ({ ...prev, ...search }) as DashboardSearch } : {}),
  }

  switch (page) {
    case "today":
      return (
        <Link to="/$epic/{-$date}" params={{ epic, date }} activeOptions={{ exact: true }} {...shared}>
          {children}
        </Link>
      )
    case "attention":
      return (
        <Link to="/$epic/{-$date}/attention" params={{ epic, date }} {...shared}>
          {children}
        </Link>
      )
    case "reviews":
      return (
        <Link to="/$epic/{-$date}/reviews" params={{ epic, date }} {...shared}>
          {children}
        </Link>
      )
    case "week":
      return (
        <Link to="/$epic/{-$date}/week" params={{ epic, date }} {...shared}>
          {children}
        </Link>
      )
    case "people":
      return (
        <Link to="/$epic/{-$date}/people" params={{ epic, date }} {...shared}>
          {children}
        </Link>
      )
    case "signoff":
      return (
        <Link to="/$epic/{-$date}/signoff" params={{ epic, date }} {...shared}>
          {children}
        </Link>
      )
    case "scope":
      return (
        <Link to="/$epic/{-$date}/scope" params={{ epic, date }} {...shared}>
          {children}
        </Link>
      )
    case "config":
      return (
        <Link to="/$epic/{-$date}/config" params={{ epic, date }} {...shared}>
          {children}
        </Link>
      )
    case "feature":
      return (
        <Link to="/$epic/{-$date}/f/$code" params={{ epic, date, code: code! }} {...shared}>
          {children}
        </Link>
      )
    case "milestone":
      return (
        <Link to="/$epic/{-$date}/m/$id" params={{ epic, date, id: id! }} {...shared}>
          {children}
        </Link>
      )
  }
}
