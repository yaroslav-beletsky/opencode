import { Agent } from "@opencode/core/agent"
import { Location } from "@opencode/core/location"
import { FSUtil } from "@opencode/util/fs-util"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"
import { AgentNotFoundError } from "@opencode/protocol/errors"
import path from "path"

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

        const parsed = JSON.parse(text)

        parsed.agents = parsed.agents || {}
        for (const [agentID, agentConfig] of Object.entries(ctx.payload.agents)) {
          parsed.agents[agentID] = agentConfig
        }

        if (ctx.payload.default_agent !== undefined) {
          parsed.default_agent = ctx.payload.default_agent
        }

        const updated = JSON.stringify(parsed, null, 2)

        yield* fs.writeWithDirs(configPath, updated.endsWith("\n") ? updated : `${updated}\n`)

        yield* Effect.sleep("100 millis")
      }),
    ),
)
