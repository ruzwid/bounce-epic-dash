import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useShell } from "./ShellContext"

export type ShellPage = "today" | "attention" | "reviews" | "config" | "feature" | "milestone"

type ShellLinkProps = {
  page: ShellPage
  /** Required when `page` is "feature" — the feature slug, e.g. "f1-1". */
  code?: string
  /** Required when `page` is "milestone" — the milestone id, e.g. "m1". */
  id?: string
  className?: string
  /** Applied when this link matches the current route. */
  activeProps?: Record<string, unknown>
  title?: string
  children: ReactNode
}

/**
 * One link component for the whole shell, so no caller has to know whether
 * it is rendering inside the latest-snapshot route tree or a dated one.
 * The branches are written out rather than computed because TanStack's
 * `to` is a literal union — building the path as a template string would
 * throw away the type checking that makes a typo a build error.
 */
export function ShellLink({ page, code, id, className, activeProps, title, children }: ShellLinkProps) {
  const { date } = useShell()
  const shared = { className, activeProps, title }

  if (date !== null) {
    switch (page) {
      case "today":
        return (
          <Link to="/$date" params={{ date }} activeOptions={{ exact: true }} {...shared}>
            {children}
          </Link>
        )
      case "attention":
        return (
          <Link to="/$date/attention" params={{ date }} {...shared}>
            {children}
          </Link>
        )
      case "reviews":
        return (
          <Link to="/$date/reviews" params={{ date }} {...shared}>
            {children}
          </Link>
        )
      case "config":
        return (
          <Link to="/$date/config" params={{ date }} {...shared}>
            {children}
          </Link>
        )
      case "feature":
        return (
          <Link to="/$date/f/$code" params={{ date, code: code! }} {...shared}>
            {children}
          </Link>
        )
      case "milestone":
        return (
          <Link to="/$date/m/$id" params={{ date, id: id! }} {...shared}>
            {children}
          </Link>
        )
    }
  }

  switch (page) {
    case "today":
      return (
        <Link to="/" activeOptions={{ exact: true }} {...shared}>
          {children}
        </Link>
      )
    case "attention":
      return (
        <Link to="/attention" {...shared}>
          {children}
        </Link>
      )
    case "reviews":
      return (
        <Link to="/reviews" {...shared}>
          {children}
        </Link>
      )
    case "config":
      return (
        <Link to="/config" {...shared}>
          {children}
        </Link>
      )
    case "feature":
      return (
        <Link to="/f/$code" params={{ code: code! }} {...shared}>
          {children}
        </Link>
      )
    case "milestone":
      return (
        <Link to="/m/$id" params={{ id: id! }} {...shared}>
          {children}
        </Link>
      )
  }
}
