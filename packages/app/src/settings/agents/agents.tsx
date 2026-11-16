import { createMemo, createResource, createSignal, For, Show, type Component, type JSX } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { Button } from "@opencode/ui/button"
import { Badge } from "@opencode/ui/badge"
import { useDialog } from "@opencode/ui/context/dialog"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { useData } from "@/runtime/server/current"
import { SettingsSearchEmpty } from "@/settings/search-empty"
import { SettingsSearchField } from "@/settings/search-field"
import { ConfigAgent } from "@opencode/schema/config/agent"
import { AgentEditDialog } from "./agent-edit-dialog"
import "@/settings/settings.css"
import "./agents.css"

type AgentConfig = typeof ConfigAgent.Info.Type
type AgentItem = NonNullable<ReturnType<ReturnType<typeof useData>["location"]["agent"]["list"]>>[number]

interface AgentTeam {
  name: string
  primary?: AgentItem
  agents: AgentItem[]
}

export const SettingsAgents: Component<{
  active?: boolean
  headerAction?: JSX.Element
}> = (props) => {
  const language = useLanguage()
  const sdk = useServerSDK()
  const data = useData()
  const dialog = useDialog()

  const directory = () => sdk.scope.directory

  const [filter, setFilter] = createSignal("")
  const [selectedTeam, setSelectedTeam] = createSignal<string>("all")

  const agents = () => data.location.agent.list({ directory: directory() })

  const [config] = createResource(directory, async (dir) => {
    if (!dir) return []
    return await sdk.api.config.get()
  })

  // Group agents into teams
  const teams = createMemo((): AgentTeam[] => {
    const items = agents() ?? []
    if (items.length === 0) return []

    const teamsMap = new Map<string, AgentTeam>()

    const primaries = items.filter((a: AgentItem) => a.mode === "primary" && !a.hidden)

    // Create teams based on name prefixes or just use primaries
    primaries.forEach((primary: AgentItem) => {
      const teamName = primary.name

      teamsMap.set(primary.id, {
        name: teamName,
        primary,
        agents: [primary],
      })
    })

    // Assign subagents to teams based on name prefix
    items
      .filter((a: AgentItem) => a.mode === "subagent")
      .forEach((agent: AgentItem) => {
        const prefix = agent.id.split("-")[0]

        // Find matching team by prefix
        let assigned = false
        for (const [teamId, team] of teamsMap.entries()) {
          if (teamId.startsWith(prefix) || agent.id.startsWith(prefix)) {
            team.agents.push(agent)
            assigned = true
            break
          }
        }

        // If no team found, create an "Other" team
        if (!assigned) {
          const otherTeam = teamsMap.get("other") ?? {
            name: "Other",
            agents: [],
          }
          otherTeam.agents.push(agent)
          teamsMap.set("other", otherTeam)
        }
      })

    // Add "all" mode agents to all teams
    items
      .filter((a: AgentItem) => a.mode === "all")
      .forEach((agent: AgentItem) => {
        teamsMap.forEach((team) => {
          team.agents.push(agent)
        })
      })

    return Array.from(teamsMap.values())
  })

  const filteredAgents = createMemo(() => {
    const items = agents() ?? []
    const query = filter().toLowerCase()
    const team = selectedTeam()

    let filtered = items

    // Filter by team
    if (team !== "all") {
      const selectedTeamData = teams().find((t) => t.primary?.id === team)
      if (selectedTeamData) {
        filtered = selectedTeamData.agents
      }
    }

    // Filter by search query
    if (query) {
      filtered = filtered.filter((agent) => {
        const searchText = [
          agent.id,
          agent.name,
          agent.description ?? "",
          agent.model?.providerID ?? "",
          agent.model?.id ?? "",
          agent.mode,
        ]
          .join(" ")
          .toLowerCase()

        return searchText.includes(query)
      })
    }

    return filtered
  })

  const defaultAgent = createMemo(() => {
    const items = agents() ?? []
    return items?.find((agent: AgentItem) => agent.mode === "primary" && !agent.hidden)
  })

  const getAgentSource = (agentId: string): "project" | "global" | "builtin" => {
    const entries = config() ?? []

    for (const entry of entries.toReversed()) {
      if (entry.type !== "document") continue
      if (entry.info.agents?.[agentId]) {
        // Check if it's from project (has path in current directory)
        if (entry.path?.includes("opencode.json")) {
          return "project"
        }
        return "global"
      }
    }

    return "builtin"
  }

  const formatModelName = (agent: AgentItem) => {
    if (!agent.model) return language.t("common.none")
    return `${agent.model.providerID}/${agent.model.id}`
  }

  const formatMode = (mode: AgentItem["mode"]) => {
    return language.t(`settings.agents.mode.${mode}` as const)
  }

  const formatTemperature = (agent: AgentItem) => {
    const temp = agent.request.body.temperature
    if (temp === undefined) return "—"
    return temp.toFixed(2)
  }

  const formatSteps = (steps?: number) => {
    if (!steps) return "—"
    return steps.toString()
  }

  const formatPermissions = (agent: AgentItem) => {
    const count = agent.permissions.length
    return language.plural("settings.agents.permissions.count", count, { count })
  }

  const handleEdit = (agent: AgentItem) => {
    dialog.show(() => (
      <AgentEditDialog
        agent={agent as any}
        onSave={async (updates) => {
          const dir = directory()
          if (!dir) return

          await sdk.api.agent.update({
            agents: {
              [agent.id]: updates as any,
            },
          })

          // Refetch will happen via global data reactivity
          await new Promise((resolve) => setTimeout(resolve, 300))
        }}
        onClose={() => dialog.close()}
      />
    ))
  }

  const handleSetDefault = async (agent: AgentItem) => {
    const dir = directory()
    if (!dir) return

    await sdk.api.agent.update({
      default_agent: agent.id,
      agents: {},
    })

    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  return (
    <>
      <div class="settings-tab-header settings-tab-header--stacked">
        <div class="settings-tab-header-row">
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="settings-tab-title">{language.t("settings.agents.title")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">
              {language.t("settings.agents.description")}
            </span>
          </div>
          <div class="settings-tab-header-actions">{props.headerAction}</div>
        </div>

        <Show when={teams().length > 1}>
          <div class="flex gap-2 items-center">
            <span class="text-12-medium text-v2-text-text">{language.t("settings.agents.team")}:</span>
            <div class="flex gap-1 flex-wrap">
              <Button
                size="small"
                variant={selectedTeam() === "all" ? "neutral" : "ghost"}
                onClick={() => setSelectedTeam("all")}
              >
                {language.t("settings.agents.allTeams")}
              </Button>
              <For each={teams().filter((t) => t.primary)}>
                {(team) => (
                  <Button
                    size="small"
                    variant={selectedTeam() === team.primary!.id ? "neutral" : "ghost"}
                    onClick={() => setSelectedTeam(team.primary!.id)}
                  >
                    {team.name}
                  </Button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <SettingsSearchField
          value={filter()}
          active={props.active ?? true}
          onInput={(value) => setFilter(value)}
          placeholder={language.t("common.search")}
        />
      </div>

      <div class="settings-tab-body settings-agents">
        <Show
          when={agents() !== undefined && filteredAgents().length > 0}
          fallback={
            <Show
              when={filter()}
              fallback={<div class="settings-agents-status">{language.t("settings.agents.empty")}</div>}
            >
              <div class="settings-tab-search-empty">
                <SettingsSearchEmpty query={filter()} />
              </div>
            </Show>
          }
        >
          <div class="flex flex-col gap-3">
            <For each={filteredAgents()}>
              {(agent) => {
                const isDefault = () => agent.id === defaultAgent()?.id
                const source = () => getAgentSource(agent.id)

                return (
                  <div class="settings-agents-item">
                    <div class="settings-agents-item-header">
                      <div class="settings-agents-item-title">
                        <span class="settings-agents-item-name">{agent.name}</span>
                        <Show when={isDefault()}>
                          <Badge variant="neutral">{language.t("settings.agents.defaultAgent")}</Badge>
                        </Show>
                        <Show when={agent.hidden}>
                          <Badge variant="neutral">{language.t("settings.agents.disabled")}</Badge>
                        </Show>
                        <Badge variant="neutral">{language.t(`settings.agents.source.${source()}` as const)}</Badge>
                      </div>
                      <div class="settings-agents-item-actions">
                        <Show when={agent.mode === "primary" && !isDefault()}>
                          <Button size="small" variant="ghost" onClick={() => handleSetDefault(agent)}>
                            {language.t("settings.agents.setDefault")}
                          </Button>
                        </Show>
                        <Button size="small" variant="ghost" onClick={() => handleEdit(agent)}>
                          <Icon name="edit" size="small" />
                          {language.t("settings.agents.edit")}
                        </Button>
                      </div>
                    </div>

                    <div class="settings-agents-item-id text-11-regular text-v2-text-text-muted font-mono">
                      {agent.id}
                    </div>

                    <Show when={agent.description}>
                      <div class="settings-agents-item-description text-12-regular text-v2-text-text-muted">
                        {agent.description}
                      </div>
                    </Show>

                    <div class="settings-agents-item-details">
                      <div class="settings-agents-item-detail">
                        <span class="settings-agents-item-detail-label">
                          {language.t("settings.agents.mode.label")}:
                        </span>
                        <span class="settings-agents-item-detail-value">{formatMode(agent.mode)}</span>
                      </div>

                      <div class="settings-agents-item-detail">
                        <span class="settings-agents-item-detail-label">{language.t("settings.agents.model")}:</span>
                        <span class="settings-agents-item-detail-value">{formatModelName(agent)}</span>
                      </div>

                      <div class="settings-agents-item-detail">
                        <span class="settings-agents-item-detail-label">
                          {language.t("settings.agents.temperature")}:
                        </span>
                        <span class="settings-agents-item-detail-value">{formatTemperature(agent)}</span>
                      </div>

                      <Show when={agent.steps}>
                        <div class="settings-agents-item-detail">
                          <span class="settings-agents-item-detail-label">
                            {language.t("settings.agents.steps")}:
                          </span>
                          <span class="settings-agents-item-detail-value">{formatSteps(agent.steps)}</span>
                        </div>
                      </Show>

                      <div class="settings-agents-item-detail">
                        <span class="settings-agents-item-detail-label">
                          {language.t("settings.agents.permissions")}:
                        </span>
                        <span class="settings-agents-item-detail-value">{formatPermissions(agent)}</span>
                      </div>
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </div>
    </>
  )
}
