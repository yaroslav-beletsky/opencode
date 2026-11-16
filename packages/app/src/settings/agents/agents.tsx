import { createMemo, createResource, createSignal, For, Show, type Component, type JSX } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { Switch } from "@opencode/ui/switch"
import { Badge } from "@opencode/ui/badge"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import { SettingsSearchEmpty } from "@/settings/search-empty"
import { SettingsSearchField } from "@/settings/search-field"
import { Agent } from "@opencode/schema/agent"
import "@/settings/settings.css"
import "./agents.css"

type AgentItem = typeof Agent.Info.Type

export const SettingsAgents: Component<{
  active?: boolean
  headerAction?: JSX.Element
}> = (props) => {
  const language = useLanguage()
  const sdk = useServerSDK()

  const [filter, setFilter] = createSignal("")

  const [agents] = createResource(async () => {
    const response = await sdk.client.agent.list()
    return response
  })

  const filteredAgents = createMemo(() => {
    const items = agents() ?? []
    const query = filter().toLowerCase()

    if (!query) return items

    return items.filter((agent) => {
      const searchText = [
        agent.id,
        agent.name,
        agent.description ?? "",
        agent.model?.provider ?? "",
        agent.model?.model ?? "",
        agent.mode,
      ]
        .join(" ")
        .toLowerCase()

      return searchText.includes(query)
    })
  })

  const defaultAgent = createMemo(() => {
    const items = agents() ?? []
    return items.find((agent) => agent.mode === "primary" && !agent.hidden)
  })

  const formatModelName = (agent: AgentItem) => {
    if (!agent.model) return language.t("common.none")
    return `${agent.model.provider}/${agent.model.model}`
  }

  const formatMode = (mode: AgentItem["mode"]) => {
    return language.t(`settings.agents.mode.${mode}` as const)
  }

  const formatTemperature = (temp?: number) => {
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
        <SettingsSearchField
          value={filter()}
          active={props.active ?? true}
          onInput={(value) => setFilter(value)}
          placeholder={language.t("common.search")}
        />
      </div>

      <div class="settings-tab-body settings-agents">
        <Show when={!agents.loading} fallback={<div class="settings-agents-status">{language.t("common.loading")}</div>}>
          <Show
            when={filteredAgents().length > 0}
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
            <SettingsList variant="catalog">
              <For each={filteredAgents()}>
                {(agent) => {
                  const isDefault = () => agent.id === defaultAgent()?.id

                  return (
                    <div class="settings-agents-item">
                      <div class="settings-agents-item-header">
                        <div class="settings-agents-item-title">
                          <span class="settings-agents-item-name">{agent.name}</span>
                          <Show when={isDefault()}>
                            <Badge variant="neutral" size="small">
                              {language.t("settings.agents.defaultAgent")}
                            </Badge>
                          </Show>
                          <Show when={agent.hidden}>
                            <Badge variant="neutral" size="small">
                              {language.t("settings.agents.disabled")}
                            </Badge>
                          </Show>
                        </div>
                        <div class="settings-agents-item-id text-11-regular text-v2-text-text-muted">{agent.id}</div>
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
            </SettingsList>
          </Show>
        </Show>
      </div>
    </>
  )
}
