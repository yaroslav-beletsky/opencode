import { createSignal, Show, type Component } from "solid-js"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { Button } from "@opencode/ui/button"
import { TextField } from "@opencode/ui/text-field"
import { Menu } from "@opencode/ui/menu"
import { Switch } from "@opencode/ui/switch"
import { useLanguage } from "@/runtime/i18n/language"
import { Agent } from "@opencode/schema/agent"
import { ConfigAgent } from "@opencode/schema/config/agent"

type AgentInfo = typeof Agent.Info.Type
type AgentConfig = typeof ConfigAgent.Info.Type

interface Props {
  agent: AgentInfo
  onSave: (updates: Partial<AgentConfig>) => Promise<void>
  onClose: () => void
}

export const AgentEditDialog: Component<Props> = (props) => {
  const language = useLanguage()

  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string>()

  const [description, setDescription] = createSignal(props.agent.description ?? "")
  const [system, setSystem] = createSignal(props.agent.system ?? "")
  const [temperature, setTemperature] = createSignal(
    props.agent.request.body.temperature?.toString() ?? "0.7",
  )
  const [steps, setSteps] = createSignal(props.agent.steps?.toString() ?? "")
  const [enabled, setEnabled] = createSignal(!props.agent.hidden)
  const [modelProvider, setModelProvider] = createSignal(props.agent.model?.providerID ?? "")
  const [modelId, setModelId] = createSignal(props.agent.model?.id ?? "")
  const [mode, setMode] = createSignal<"primary" | "subagent" | "all">(props.agent.mode)

  const handleSave = async () => {
    setSaving(true)
    setError(undefined)

    try {
      const updates: Record<string, unknown> = {
        description: description() || undefined,
        system: system() || undefined,
        hidden: !enabled(),
        mode: mode(),
      }

      if (modelProvider() && modelId()) {
        updates.model = {
          providerID: modelProvider(),
          model: modelId(),
        }
      }

      const tempValue = parseFloat(temperature())
      if (!isNaN(tempValue)) {
        updates.request = {
          body: {
            temperature: tempValue,
          },
        }
      }

      const stepsValue = parseInt(steps())
      if (!isNaN(stepsValue) && stepsValue > 0) {
        updates.steps = stepsValue
      }

      await props.onSave(updates as Partial<AgentConfig>)
      props.onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog size="large" onCloseAutoFocus={() => {}}>
      <DialogHeader>
        <DialogTitle>
          {language.t("settings.agents.edit")}: {props.agent.name}
        </DialogTitle>
      </DialogHeader>

      <DialogBody class="flex flex-col gap-4">
        <Show when={error()}>
          <div class="rounded border border-v2-border-error bg-v2-background-error-muted p-3 text-12-regular text-v2-text-error">
            {error()}
          </div>
        </Show>

        <div class="flex flex-col gap-2">
          <label class="text-12-medium text-v2-text-text">
            {language.t("settings.agents.description.label")}
          </label>
          <TextField
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            placeholder={language.t("settings.agents.description.placeholder")}
          />
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-12-medium text-v2-text-text">{language.t("settings.agents.mode.label")}</label>
          <Menu>
            <Menu.Trigger as={Button} variant="outline" class="justify-between">
              {language.t(`settings.agents.mode.${mode()}` as const)}
              <span class="ml-auto">▼</span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content>
                <Menu.Item onSelect={() => setMode("primary")}>
                  {language.t("settings.agents.mode.primary")}
                </Menu.Item>
                <Menu.Item onSelect={() => setMode("subagent")}>
                  {language.t("settings.agents.mode.subagent")}
                </Menu.Item>
                <Menu.Item onSelect={() => setMode("all")}>{language.t("settings.agents.mode.all")}</Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        </div>

        <div class="flex gap-4">
          <div class="flex flex-1 flex-col gap-2">
            <label class="text-12-medium text-v2-text-text">{language.t("settings.providers.title")}</label>
            <TextField
              value={modelProvider()}
              onInput={(e) => setModelProvider(e.currentTarget.value)}
              placeholder="e.g., openai, anthropic"
            />
          </div>

          <div class="flex flex-1 flex-col gap-2">
            <label class="text-12-medium text-v2-text-text">{language.t("settings.agents.model")}</label>
            <TextField
              value={modelId()}
              onInput={(e) => setModelId(e.currentTarget.value)}
              placeholder="e.g., gpt-4, claude-3-sonnet"
            />
          </div>
        </div>

        <div class="flex gap-4">
          <div class="flex flex-1 flex-col gap-2">
            <label class="text-12-medium text-v2-text-text">{language.t("settings.agents.temperature")}</label>
            <TextField
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={temperature()}
              onInput={(e) => setTemperature(e.currentTarget.value)}
            />
          </div>

          <div class="flex flex-1 flex-col gap-2">
            <label class="text-12-medium text-v2-text-text">{language.t("settings.agents.steps")}</label>
            <TextField
              type="number"
              min="1"
              value={steps()}
              onInput={(e) => setSteps(e.currentTarget.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-12-medium text-v2-text-text">{language.t("settings.agents.prompt")}</label>
          <textarea
            class="min-h-32 rounded border border-v2-border-border bg-v2-background-surface p-2 text-12-regular text-v2-text-text font-mono"
            value={system()}
            onInput={(e) => setSystem(e.currentTarget.value)}
            placeholder={language.t("settings.agents.prompt.placeholder")}
          />
        </div>

        <div class="flex items-center gap-2">
          <Switch checked={enabled()} onChange={setEnabled}>
            {language.t("settings.agents.enabled")}
          </Switch>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" onClick={props.onClose} disabled={saving()}>
          {language.t("settings.agents.cancel")}
        </Button>
        <Button onClick={handleSave} disabled={saving()}>
          {saving() ? language.t("common.saving") : language.t("settings.agents.save")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
