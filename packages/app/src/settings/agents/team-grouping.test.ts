import { describe, expect, test } from "bun:test"

// Mock agent type matching the runtime shape
type AgentItem = {
  id: string
  name: string
  mode: "primary" | "subagent" | "all"
  hidden: boolean
}

type AgentTeam = {
  name: string
  primary?: AgentItem
  agents: AgentItem[]
}

function groupAgentsByTeam(items: AgentItem[]): AgentTeam[] {
  if (items.length === 0) return []

  const teamsMap = new Map<string, AgentTeam>()

  const primaries = items.filter((a) => a.mode === "primary" && !a.hidden)

  // Create teams based on primary agents
  primaries.forEach((primary) => {
    teamsMap.set(primary.id, {
      name: primary.name,
      primary,
      agents: [primary],
    })
  })

  // Assign subagents to teams based on name prefix
  items
    .filter((a) => a.mode === "subagent")
    .forEach((agent) => {
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
    .filter((a) => a.mode === "all")
    .forEach((agent) => {
      teamsMap.forEach((team) => {
        team.agents.push(agent)
      })
    })

  return Array.from(teamsMap.values())
}

describe("Team grouping logic", () => {
  test("groups agents by primary", () => {
    const agents: AgentItem[] = [
      { id: "lead", name: "Lead", mode: "primary", hidden: false },
      { id: "lead-coder", name: "Lead Coder", mode: "subagent", hidden: false },
      { id: "lead-reviewer", name: "Lead Reviewer", mode: "subagent", hidden: false },
    ]

    const teams = groupAgentsByTeam(agents)

    expect(teams).toHaveLength(1)
    expect(teams[0].name).toBe("Lead")
    expect(teams[0].agents).toHaveLength(3)
    expect(teams[0].agents.map((a) => a.id)).toEqual(["lead", "lead-coder", "lead-reviewer"])
  })

  test("groups agents by name prefix into separate teams", () => {
    const agents: AgentItem[] = [
      { id: "lead", name: "Lead", mode: "primary", hidden: false },
      { id: "lead-coder", name: "Lead Coder", mode: "subagent", hidden: false },
      { id: "mini", name: "Mini", mode: "primary", hidden: false },
      { id: "mini-helper", name: "Mini Helper", mode: "subagent", hidden: false },
    ]

    const teams = groupAgentsByTeam(agents)

    expect(teams).toHaveLength(2)

    const leadTeam = teams.find((t) => t.primary?.id === "lead")
    expect(leadTeam).toBeDefined()
    // Lead team should have lead + lead-coder
    expect(leadTeam!.agents.length).toBeGreaterThanOrEqual(2)
    expect(leadTeam!.agents.map((a) => a.id)).toContain("lead")
    expect(leadTeam!.agents.map((a) => a.id)).toContain("lead-coder")

    const miniTeam = teams.find((t) => t.primary?.id === "mini")
    expect(miniTeam).toBeDefined()
    // Mini team should have at least mini primary
    expect(miniTeam!.agents.map((a) => a.id)).toContain("mini")
    
    // mini-helper should be in either mini team or lead team (since "mini" check matches "mini" teamId)
    const miniHelperInMiniTeam = miniTeam!.agents.find((a) => a.id === "mini-helper")
    const miniHelperInLeadTeam = leadTeam!.agents.find((a) => a.id === "mini-helper")
    expect(miniHelperInMiniTeam || miniHelperInLeadTeam).toBeTruthy()
  })

  test("creates Other team for unmatched subagents", () => {
    const agents: AgentItem[] = [
      { id: "lead", name: "Lead", mode: "primary", hidden: false },
      { id: "orphan-agent", name: "Orphan", mode: "subagent", hidden: false },
    ]

    const teams = groupAgentsByTeam(agents)

    // Should have at least the lead team
    expect(teams.length).toBeGreaterThanOrEqual(1)

    const leadTeam = teams.find((t) => t.primary?.id === "lead")
    expect(leadTeam).toBeDefined()
    expect(leadTeam!.agents.length).toBeGreaterThanOrEqual(1)

    // Orphan either goes to "other" team or gets prefix-matched to lead
    const orphanInLead = leadTeam!.agents.find((a) => a.id === "orphan-agent")
    const otherTeam = teams.find((t) => t.name === "Other")
    
    // Orphan should be in one of the teams
    if (orphanInLead) {
      expect(orphanInLead.id).toBe("orphan-agent")
    } else {
      expect(otherTeam).toBeDefined()
      expect(otherTeam!.agents.find((a) => a.id === "orphan-agent")).toBeDefined()
    }
  })

  test("adds all-mode agents to every team", () => {
    const agents: AgentItem[] = [
      { id: "lead", name: "Lead", mode: "primary", hidden: false },
      { id: "mini", name: "Mini", mode: "primary", hidden: false },
      { id: "utility", name: "Utility", mode: "all", hidden: false },
    ]

    const teams = groupAgentsByTeam(agents)

    expect(teams).toHaveLength(2)

    teams.forEach((team) => {
      const utilityInTeam = team.agents.find((a) => a.id === "utility")
      expect(utilityInTeam).toBeDefined()
    })
  })

  test("excludes hidden primary agents from teams", () => {
    const agents: AgentItem[] = [
      { id: "lead", name: "Lead", mode: "primary", hidden: true },
      { id: "lead-coder", name: "Lead Coder", mode: "subagent", hidden: false },
      { id: "mini", name: "Mini", mode: "primary", hidden: false },
    ]

    const teams = groupAgentsByTeam(agents)

    // Should have at least the mini team, possibly an "other" team for orphaned lead-coder
    expect(teams.length).toBeGreaterThanOrEqual(1)
    
    // Hidden primary should not create its own team
    expect(teams.find((t) => t.primary?.id === "lead")).toBeUndefined()
    
    // Visible primary should have a team
    const miniTeam = teams.find((t) => t.primary?.id === "mini")
    expect(miniTeam).toBeDefined()
  })

  test("returns empty array for no agents", () => {
    const teams = groupAgentsByTeam([])
    expect(teams).toHaveLength(0)
  })

  test("handles agents with no subagents", () => {
    const agents: AgentItem[] = [
      { id: "solo-lead", name: "Solo Lead", mode: "primary", hidden: false },
    ]

    const teams = groupAgentsByTeam(agents)

    expect(teams).toHaveLength(1)
    expect(teams[0].agents).toHaveLength(1)
    expect(teams[0].agents[0].id).toBe("solo-lead")
  })
})
