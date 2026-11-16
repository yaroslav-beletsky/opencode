import { describe, expect, test, beforeEach } from "bun:test"
import * as jsonc from "jsonc-parser"
import path from "path"
import fs from "fs/promises"

const testDir = "/tmp/opencode-agent-update-test"

describe("Agent config update with JSONC preservation", () => {
  beforeEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true })
    } catch {}
    await fs.mkdir(testDir, { recursive: true })
  })

  test("creates new opencode.json with agents", async () => {
    const configPath = path.join(testDir, "opencode.json")
    let text = "{}\n"

    const agentUpdates = {
      "test-agent": {
        description: "Test agent",
        mode: "primary",
        model: {
          providerID: "openai",
          model: "gpt-4",
        },
      },
    }

    // Apply edits using jsonc-parser - do it in steps to avoid overlaps
    let parsed = jsonc.parse(text)

    if (!parsed.agents) {
      const edits = jsonc.modify(text, ["agents"], {}, { formattingOptions: { insertSpaces: true, tabSize: 2 } })
      text = jsonc.applyEdits(text, edits)
      parsed = jsonc.parse(text)
    }

    for (const [agentID, agentConfig] of Object.entries(agentUpdates)) {
      const edits = jsonc.modify(text, ["agents", agentID], agentConfig, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      })
      text = jsonc.applyEdits(text, edits)
    }

    await fs.writeFile(configPath, text)

    const result = await fs.readFile(configPath, "utf-8")
    const resultParsed = JSON.parse(result)

    expect(resultParsed.agents).toBeDefined()
    expect(resultParsed.agents["test-agent"]).toBeDefined()
    expect(resultParsed.agents["test-agent"].description).toBe("Test agent")
    expect(resultParsed.agents["test-agent"].mode).toBe("primary")
  })

  test("preserves JSONC comments when updating", async () => {
    const configPath = path.join(testDir, "opencode.json")

    // Create initial config with comments
    const initial = `{
  // This is a comment about agents
  "agents": {
    "existing": {
      "description": "Existing agent",
      "mode": "primary" // inline comment
    }
  },
  "default_agent": "existing" // default comment
}
`
    await fs.writeFile(configPath, initial)

    const text = await fs.readFile(configPath, "utf-8")

    const agentUpdates = {
      "new-agent": {
        description: "New agent",
        mode: "subagent",
      },
    }

    const parsed = jsonc.parse(text)
    let edits: jsonc.Edit[] = []

    for (const [agentID, agentConfig] of Object.entries(agentUpdates)) {
      const agentPath = ["agents", agentID]
      edits.push(
        ...jsonc.modify(text, agentPath, agentConfig, {
          formattingOptions: { insertSpaces: true, tabSize: 2 },
        }),
      )
    }

    const updated = jsonc.applyEdits(text, edits)
    await fs.writeFile(configPath, updated)

    const result = await fs.readFile(configPath, "utf-8")

    // Verify comments are preserved
    expect(result).toContain("// This is a comment about agents")
    expect(result).toContain("// inline comment")
    expect(result).toContain("// default comment")

    // Verify structure is correct
    const resultParsed = jsonc.parse(result)
    expect(resultParsed.agents.existing).toBeDefined()
    expect(resultParsed.agents["new-agent"]).toBeDefined()
    expect(resultParsed.agents["new-agent"].description).toBe("New agent")
  })

  test("updates existing agent while preserving other fields via merge", async () => {
    const configPath = path.join(testDir, "opencode.json")

    const initial = {
      agents: {
        "test-agent": {
          description: "Original description",
          mode: "primary",
          model: {
            providerID: "openai",
            model: "gpt-4",
          },
          steps: 100,
          permissions: ["read", "write"],
        },
      },
    }
    const initialText = JSON.stringify(initial, null, 2)
    await fs.writeFile(configPath, initialText)

    const text = await fs.readFile(configPath, "utf-8")
    const parsed = jsonc.parse(text)

    const agentUpdates = {
      "test-agent": {
        description: "Updated description",
      },
    }

    let edits: jsonc.Edit[] = []

    for (const [agentID, agentConfig] of Object.entries(agentUpdates)) {
      const agentPath = ["agents", agentID]
      const existingAgent = parsed.agents?.[agentID]

      if (existingAgent) {
        // Merge with existing to preserve unmodified fields
        const merged = { ...existingAgent, ...agentConfig }
        edits.push(
          ...jsonc.modify(text, agentPath, merged, {
            formattingOptions: { insertSpaces: true, tabSize: 2 },
          }),
        )
      }
    }

    const updated = jsonc.applyEdits(text, edits)
    await fs.writeFile(configPath, updated)

    const result = await fs.readFile(configPath, "utf-8")
    const resultParsed = JSON.parse(result)

    expect(resultParsed.agents["test-agent"].description).toBe("Updated description")
    // These fields should be preserved from the merge
    expect(resultParsed.agents["test-agent"].mode).toBe("primary")
    expect(resultParsed.agents["test-agent"].steps).toBe(100)
    expect(resultParsed.agents["test-agent"].permissions).toEqual(["read", "write"])
  })

  test("updates default_agent", async () => {
    const configPath = path.join(testDir, "opencode.json")

    const initial = {
      agents: {
        agent1: { mode: "primary" },
        agent2: { mode: "primary" },
      },
      default_agent: "agent1",
    }
    const initialText = JSON.stringify(initial, null, 2)
    await fs.writeFile(configPath, initialText)

    const text = await fs.readFile(configPath, "utf-8")

    const edits = jsonc.modify(text, ["default_agent"], "agent2", {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    })

    const updated = jsonc.applyEdits(text, edits)
    await fs.writeFile(configPath, updated)

    const result = await fs.readFile(configPath, "utf-8")
    const resultParsed = JSON.parse(result)

    expect(resultParsed.default_agent).toBe("agent2")
  })

  test("handles trailing newline correctly", async () => {
    const configPath = path.join(testDir, "opencode.json")
    const text = "{}\n"

    const edits = jsonc.modify(text, ["agents", "test"], { description: "Test" }, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    })

    let updated = jsonc.applyEdits(text, edits)
    const final = updated.endsWith("\n") ? updated : `${updated}\n`

    await fs.writeFile(configPath, final)

    const result = await fs.readFile(configPath, "utf-8")
    expect(result.endsWith("\n")).toBe(true)
  })
})
