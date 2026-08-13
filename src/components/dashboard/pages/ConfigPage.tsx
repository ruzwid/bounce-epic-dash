import { ChevronRight } from "lucide-react"
import { configSource, loadAppConfig } from "@/lib/dashboard/appConfig"
import { WORK_STATUS_LABELS } from "@/lib/dashboard/statusLabels"
import { SectionHeading } from "../SectionHeading"
import { StatusPill } from "../StatusPill"
import { Avatar } from "../Avatar"

/**
 * What the collection pipeline was told to look at. Every number on this
 * dashboard is downstream of this file, so the fastest explanation for a
 * surprising figure is usually here: a repo that isn't listed, a JIRA
 * status that isn't mapped, a weight that isn't what you assumed.
 */
export function ConfigPage() {
  const config = loadAppConfig()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display m-0 text-[28px] leading-tight">Config</h1>
        <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">
          The tracked epic, its milestones, and the rules the collector applies — read straight from{" "}
          <code className="rounded-sm bg-muted px-1.5 py-0.5">config.yaml</code> at build time. Credentials are not part
          of this file and are never published.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <SectionHeading>Epic</SectionHeading>
        <dl className="surface m-0 grid gap-x-6 gap-y-0 rounded-4xl border border-border bg-card px-5 py-1 sm:grid-cols-2">
          <Field label="Key" value={config.epic.key} mono />
          <Field label="Title" value={config.epic.title} />
          <Field label="PR search floor" value={config.epic.startDate} mono />
          <Field label="Target date" value={config.epic.targetDate ?? "not set"} mono />
          <Field label="JIRA project" value={config.jira.projectKey} mono />
          <Field label="GitHub org" value={config.github.org} mono />
          <Field label="Timezone" value={config.timezone} mono />
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading note="which repositories are searched for pull requests">Repository scope</SectionHeading>
        <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">
          Every non-archived repository in{" "}
          <span className="font-mono-data">{config.github.org}</span> pushed since{" "}
          <span className="font-mono-data">{config.epic.startDate}</span> is searched on each run. Pull requests are
          attributed to a story by ticket key in the branch name or title, so a ticket's work is found wherever it
          landed — there is no per-feature repository list to keep up to date.
        </p>
        <dl className="surface m-0 grid gap-x-6 gap-y-0 rounded-4xl border border-border bg-card px-5 py-1 sm:grid-cols-2">
          <Field label="Always included" value={config.github.includeRepos.join(", ") || "none"} mono />
          <Field label="Excluded" value={config.github.excludeRepos.join(", ") || "none"} mono />
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading note="weighted mean across a feature's stories">Score weights</SectionHeading>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {(Object.keys(WORK_STATUS_LABELS) as (keyof typeof WORK_STATUS_LABELS)[]).map((status) => (
            <li key={status} className="flex items-center gap-2">
              <StatusPill status={status} />
              <span className="font-mono-data text-sm">
                {config.scoreWeights[status].toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading note={`${config.milestones.length} tracked`}>Milestones</SectionHeading>
        <div className="flex flex-col gap-3">
          {config.milestones.map((milestone) => (
            <div key={milestone.id} className="surface rounded-4xl border border-border bg-card">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border-soft px-5 py-3.5">
                <span className="font-mono-data text-xs text-muted-foreground">{milestone.id}</span>
                <span className="text-[14.5px] font-medium">{milestone.title}</span>
                <span className="rounded-4xl bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {milestone.tier} tier
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {milestone.owner}
                  {milestone.ticket ? (
                    <>
                      {" · "}
                      <span className="font-mono-data">{milestone.ticket}</span>
                    </>
                  ) : null}
                </span>
              </div>
              {milestone.features.length === 0 ? (
                <p className="m-0 px-5 py-3 text-sm text-muted-foreground">
                  No feature tickets — stories are read directly from the milestone.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {milestone.features.map((feature) => (
                    <li
                      key={feature.key}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border-soft px-5 py-2.5 text-sm last:border-b-0"
                    >
                      <span className="font-mono-data w-16 shrink-0 text-xs">{feature.code}</span>
                      <span className="font-mono-data text-xs text-muted-foreground">{feature.key}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{feature.owner}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading note="raw JIRA status name → tracked status">Status mapping</SectionHeading>
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-2 p-0">
          {Object.entries(config.jira.statusMap).map(([jiraName, status]) => (
            <li key={jiraName} className="flex items-center gap-2 text-sm">
              <span className="font-mono-data rounded-4xl bg-muted px-2 py-1 text-xs">{jiraName}</span>
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
              <StatusPill status={status} />
            </li>
          ))}
        </ul>
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          This mapping is a starting hint only. The collector upgrades or downgrades each story from real pull
          request state afterwards, so a ticket marked Done with nothing merged never renders as shipped.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading note="GitHub login → display name">People</SectionHeading>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {Object.entries(config.people).map(([login, name]) => (
            <li
              key={login}
              className="flex items-center gap-2 rounded-4xl border border-border py-1.5 pr-3 pl-2 text-sm"
            >
              <Avatar login={login} name={name} size={22} />
              {name} <span className="font-mono-data text-xs text-muted-foreground">{login}</span>
            </li>
          ))}
        </ul>
      </section>

      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-4xl text-sm text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-90" />
          View config.yaml as written
        </summary>
        <pre className="surface mt-3 overflow-x-auto rounded-4xl border border-border bg-card p-5 text-xs leading-relaxed">
          <code>{configSource}</code>
        </pre>
      </details>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-soft py-3 last:border-b-0 sm:[&:nth-last-child(-n+1)]:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`m-0 text-sm ${mono ? "font-mono-data" : ""}`}>{value}</dd>
    </div>
  )
}
