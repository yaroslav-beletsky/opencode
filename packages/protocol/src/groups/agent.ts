import { Agent } from "@opencode/schema/agent"
import { Location } from "@opencode/schema/location"
import { ConfigAgent } from "@opencode/schema/config/agent"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { LocationQuery, locationQueryOpenApi } from "./location.js"
import { AgentNotFoundError } from "../errors.js"

const AgentUpdatePayload = Schema.Struct({
  agents: Schema.Record(Schema.String, ConfigAgent.Info),
  default_agent: Schema.optional(Schema.String),
})

export const AgentGroup = HttpApiGroup.make("server.agent")
  .add(
    HttpApiEndpoint.get("agent.list", "/api/agent", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Agent.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "agent.list",
          summary: "List agents",
          description: "Retrieve currently registered agents.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("agent.get", "/api/agent/:agentID", {
      params: { agentID: Agent.ID },
      query: LocationQuery,
      success: Location.response(Agent.Info),
      error: AgentNotFoundError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "agent.get",
          summary: "Get agent",
          description: "Retrieve a single currently registered agent.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("agent.update", "/api/agent", {
      query: LocationQuery,
      payload: AgentUpdatePayload,
      success: Schema.Void,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "agent.update",
          summary: "Update agent configuration",
          description: "Update agent definitions in the project configuration file.",
        }),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "agent" }))
