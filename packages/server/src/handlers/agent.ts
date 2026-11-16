import { Agent } from "@opencode/core/agent"
import { Config } from "@opencode/core/config"
import { Location } from "@opencode/core/location"
import { FSUtil } from "@opencode/util/fs-util"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"
import { AgentNotFoundError } from "@opencode/protocol/errors"
import path from "path"
import { applyEdits, modify } from "jsonc-parser"

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
        const config = yield* Config.Service

        const entries = yield* config.entries()
        const projectEntry = entries
          .toReversed()
          .find(
            (entry) =>
              entry.type === "document" &&
              entry.path &&
              entry.path.startsWith(location.directory) &&
              (entry.path.endsWith("opencode.json") || entry.path.endsWith("opencode.jsonc")),
          )

        const configPath =
          projectEntry && projectEntry.type === "document" && projectEntry.path
            ? projectEntry.path
            : path.join(location.directory, "opencode.json")

        const text = (yield* fs.readFileStringSafe(configPath)) ?? "{}\n"

        let updated = text
        for (const [agentID, agentConfig] of Object.entries(ctx.payload.agents)) {
          updated = applyEdits(
            updated,
            modify(
              updated,
              ["agents", agentID],
              agentConfig as unknown as undefined,
              {
                formattingOptions: { tabSize: 2, insertSpaces: true },
              },
            ),
          )
        }

        if (ctx.payload.default_agent !== undefined) {
          updated = applyEdits(
            updated,
            modify(updated, ["default_agent"], ctx.payload.default_agent, {
              formattingOptions: { tabSize: 2, insertSpaces: true },
            }),
          )
        }

        yield* fs.writeWithDirs(configPath, updated.endsWith("\n") ? updated : `${updated}\n`)

        yield* Effect.sleep("100 millis")

        return yield* response(Effect.void)
      }),
    ),
)
