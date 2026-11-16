import { Agent } from "@opencode/core/agent"
import { Location } from "@opencode/core/location"
import { FSUtil } from "@opencode/util/fs-util"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"
import { AgentNotFoundError, InvalidRequestError } from "@opencode/protocol/errors"
import path from "path"
import * as jsonc from "jsonc-parser"

export const AgentHandler = HttpApiBuilder.group(Api, "server.agent", (handlers) =>
  handlers
    .handle("agent.list", () => response(Agent.Service.use((agent) => agent.list())))
    .handle(
      "agent.get",
      Effect.fn(function* (ctx) {
        const agent = yield* Agent.Service.use((service) => service.get(ctx.params.agentID))
        if (!agent)
          return yield* new AgentNotFoundError({
            agentID: ctx.params.agentID,
            message: `Agent not found: ${ctx.params.agentID}`,
          })
        return yield* response(Effect.succeed(agent))
      }),
    )
    .handle(
      "agent.update",
      Effect.fn(function* (ctx) {
        const fs = yield* FSUtil.Service
        const location = yield* Location.Service

        const configPath = path.join(location.directory, "opencode.json")

        const text = (yield* fs.readFileStringSafe(configPath).pipe(
          Effect.mapError(
            (error) =>
              new InvalidRequestError({
                message: `Failed to read opencode.json: ${String(error)}`,
              }),
          ),
        )) ?? "{}\n"

        // Parse with jsonc-parser to handle comments
        const parseErrors: jsonc.ParseError[] = []
        const parsed = jsonc.parse(text, parseErrors, { allowTrailingComma: true })

        if (parseErrors.length > 0) {
          return yield* new InvalidRequestError({
            message: `Failed to parse opencode.json: ${parseErrors.map((e) => e.error).join(", ")}`,
          })
        }

        // Detect V1 format (uses "agent" instead of "agents")
        const isV1 = parsed.agent !== undefined && typeof parsed.agent === "object"
        const agentsKey = isV1 ? "agent" : "agents"

        // Build edits to apply
        const edits: jsonc.Edit[] = []

        // Ensure agents/agent object exists
        if (!parsed[agentsKey]) {
          edits.push(
            ...jsonc.modify(text, [agentsKey], {}, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
          )
        }

        // Helper to convert V2 format to V1 format
        const toV1Format = (config: any, existingAgent?: any) => {
          const v1: any = {}

          // Model: convert {providerID, model} to "providerID/model"
          if (config.model) {
            if (typeof config.model === "object" && config.model.providerID && config.model.model) {
              v1.model = `${config.model.providerID}/${config.model.model}`
            } else if (typeof config.model === "string") {
              v1.model = config.model
            }
          }

          // Temperature: extract from request.body.temperature
          if (config.request?.body?.temperature !== undefined) {
            v1.temperature = config.request.body.temperature
          } else if (config.temperature !== undefined) {
            v1.temperature = config.temperature
          }

          // Prompt: use system or keep existing prompt reference
          if (config.system !== undefined) {
            v1.prompt = config.system
          } else if (config.prompt !== undefined) {
            v1.prompt = config.prompt
          }

          // Other V1 fields
          if (config.description !== undefined) v1.description = config.description
          if (config.mode !== undefined) v1.mode = config.mode
          if (config.disabled !== undefined) v1.disable = config.disabled
          if (config.disable !== undefined) v1.disable = config.disable
          if (config.steps !== undefined) v1.steps = config.steps

          return v1
        }

        // Helper to check if prompt contains any file references (including composite)
        const containsFileReference = (prompt: string) => {
          return typeof prompt === "string" && /\{file:[^}]+\}/g.test(prompt)
        }

        // Helper to extract single file reference
        const isSingleFileReference = (prompt: string) => {
          return typeof prompt === "string" && prompt.match(/^\{file:(.+)\}$/)
        }

        // Update each agent
        for (const [agentID, agentConfig] of Object.entries(ctx.payload.agents)) {
          const agentPath = [agentsKey, agentID]
          const existingAgent = parsed[agentsKey]?.[agentID]

          // Get the prompt field name for this format
          const promptField = isV1 ? "prompt" : "system"
          const existingPrompt = existingAgent?.[promptField]

          // Check if client is trying to overwrite file references
          // Client may send V2 payload (system) even for V1 files, so check both
          if (existingPrompt && containsFileReference(existingPrompt)) {
            const newPrompt = (agentConfig as any).system ?? (agentConfig as any).prompt
            if (newPrompt !== undefined && newPrompt !== existingPrompt) {
              // Client is trying to replace a file reference with inline text
              return yield* new InvalidRequestError({
                message: `Cannot replace file reference prompt with inline text. Agent "${agentID}" has prompt with {file:...} references. To edit, modify the referenced file(s) directly, or edit the raw config to remove the references first.`,
              })
            }
          }

          // Convert to V1 format if needed
          const configToWrite = isV1 ? toV1Format(agentConfig, existingAgent) : agentConfig

          // Handle single file-referenced prompts (write to file, keep reference)
          if (isV1 && existingAgent?.prompt) {
            const fileMatch = isSingleFileReference(existingAgent.prompt)
            if (fileMatch && configToWrite.prompt && configToWrite.prompt !== existingAgent.prompt) {
              // Write the prompt to the referenced file
              const filePath = fileMatch[1]
              const absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.join(location.directory, filePath)

              yield* fs.writeWithDirs(absolutePath, configToWrite.prompt).pipe(
                Effect.mapError(
                  (error) =>
                    new InvalidRequestError({
                      message: `Failed to write prompt file ${absolutePath}: ${String(error)}`,
                    }),
                ),
              )

              // Keep the {file:...} reference in the config
              configToWrite.prompt = existingAgent.prompt
            }
          }

          if (existingAgent) {
            // Merge with existing agent to preserve unmodified fields
            const merged = { ...existingAgent, ...configToWrite }
            edits.push(
              ...jsonc.modify(text, agentPath, merged, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
            )
          } else {
            // Add new agent
            edits.push(
              ...jsonc.modify(text, agentPath, configToWrite, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
            )
          }
        }

        // Update default_agent if provided
        if (ctx.payload.default_agent !== undefined) {
          edits.push(
            ...jsonc.modify(text, ["default_agent"], ctx.payload.default_agent, {
              formattingOptions: { insertSpaces: true, tabSize: 2 },
            }),
          )
        }

        // Apply all edits
        const updated = jsonc.applyEdits(text, edits)

        // Ensure trailing newline
        const final = updated.endsWith("\n") ? updated : `${updated}\n`

        yield* fs.writeWithDirs(configPath, final).pipe(
          Effect.mapError(
            (error) =>
              new InvalidRequestError({
                message: `Failed to write opencode.json: ${String(error)}`,
              }),
          ),
        )

        // Give config watcher time to reload
        yield* Effect.sleep("100 millis")
      }),
    ),
)
