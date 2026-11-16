import { Agent } from "@opencode/core/agent"
import { Location } from "@opencode/core/location"
import { FSUtil } from "@opencode/util/fs-util"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"
import { AgentNotFoundError } from "@opencode/protocol/errors"
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

        const text = (yield* fs.readFileStringSafe(configPath)) ?? "{}\n"

        // Parse with jsonc-parser to handle comments
        const parseErrors: jsonc.ParseError[] = []
        const parsed = jsonc.parse(text, parseErrors, { allowTrailingComma: true })

        if (parseErrors.length > 0) {
          return yield* Effect.fail(
            new Error(`Failed to parse opencode.json: ${parseErrors.map((e) => e.error).join(", ")}`),
          )
        }

        // Build edits to apply
        const edits: jsonc.Edit[] = []

        // Ensure agents object exists
        if (!parsed.agents) {
          edits.push(...jsonc.modify(text, ["agents"], {}, { formattingOptions: { insertSpaces: true, tabSize: 2 } }))
        }

        // Update each agent
        for (const [agentID, agentConfig] of Object.entries(ctx.payload.agents)) {
          const agentPath = ["agents", agentID]
          const existingAgent = parsed.agents?.[agentID]

          if (existingAgent) {
            // Merge with existing agent to preserve unmodified fields
            const merged = { ...existingAgent, ...agentConfig }
            edits.push(
              ...jsonc.modify(text, agentPath, merged, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
            )
          } else {
            // Add new agent
            edits.push(
              ...jsonc.modify(text, agentPath, agentConfig, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
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

        yield* fs.writeWithDirs(configPath, final)

        // Give config watcher time to reload
        yield* Effect.sleep("100 millis")
      }),
    ),
)
