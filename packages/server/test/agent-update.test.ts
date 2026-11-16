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

  test("handles V1 format with 'agent' key and string model", async () => {
    const configPath = path.join(testDir, "opencode.json")

    // V1 format with "agent" (singular) and string model
    const initial = `{
  // V1 format configuration
  "agent": {
    "primary": {
      "model": "openai/gpt-4",
      "temperature": 0.7,
      "prompt": "You are a helpful assistant",
      "description": "Primary agent"
    }
  },
  "default_agent": "primary"
}
`
    await fs.writeFile(configPath, initial)

    let text = await fs.readFile(configPath, "utf-8")
    const parsed = jsonc.parse(text)

    // Detect V1 format
    const isV1 = parsed.agent !== undefined && typeof parsed.agent === "object"
    const agentsKey = isV1 ? "agent" : "agents"

    expect(isV1).toBe(true)

    // Simulate V2 input that needs to be converted to V1
    const v2Update = {
      model: {
        providerID: "anthropic",
        model: "claude-3",
      },
      request: {
        body: {
          temperature: 0.8,
        },
      },
      system: "You are an expert",
      description: "Updated primary",
    }

    // Convert to V1 format
    const toV1Format = (config: any) => {
      const v1: any = {}
      if (config.model && typeof config.model === "object") {
        v1.model = `${config.model.providerID}/${config.model.model}`
      }
      if (config.request?.body?.temperature !== undefined) {
        v1.temperature = config.request.body.temperature
      }
      if (config.system !== undefined) {
        v1.prompt = config.system
      }
      if (config.description !== undefined) {
        v1.description = config.description
      }
      return v1
    }

    const v1Config = toV1Format(v2Update)
    const existingAgent = parsed[agentsKey].primary
    const merged = { ...existingAgent, ...v1Config }

    const edits = jsonc.modify(text, [agentsKey, "primary"], merged, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    })

    text = jsonc.applyEdits(text, edits)
    await fs.writeFile(configPath, text)

    const result = await fs.readFile(configPath, "utf-8")
    const resultParsed = jsonc.parse(result)

    // Verify V1 format is preserved
    expect(resultParsed.agent).toBeDefined()
    expect(resultParsed.agent.primary).toBeDefined()
    expect(resultParsed.agent.primary.model).toBe("anthropic/claude-3")
    expect(resultParsed.agent.primary.temperature).toBe(0.8)
    expect(resultParsed.agent.primary.prompt).toBe("You are an expert")
    expect(resultParsed.agent.primary.description).toBe("Updated primary")

    // Verify comments are preserved
    expect(result).toContain("// V1 format configuration")
  })

  test("preserves {file:...} prompt references in V1 format", async () => {
    const configPath = path.join(testDir, "opencode.json")
    const promptPath = path.join(testDir, "prompt.md")

    // Create initial prompt file
    await fs.writeFile(promptPath, "Original prompt content")

    // V1 format with file reference
    const initial = `{
  "agent": {
    "primary": {
      "model": "openai/gpt-4",
      "prompt": "{file:./prompt.md}",
      "description": "Agent with file prompt"
    }
  }
}
`
    await fs.writeFile(configPath, initial)

    let text = await fs.readFile(configPath, "utf-8")
    const parsed = jsonc.parse(text)

    const agentsKey = "agent"

    // Update with new prompt - should write to file and keep reference
    const v2Update = {
      system: "Updated prompt content",
      description: "Updated description",
    }

    const toV1Format = (config: any) => {
      const v1: any = {}
      if (config.system !== undefined) {
        v1.prompt = config.system
      }
      if (config.description !== undefined) {
        v1.description = config.description
      }
      return v1
    }

    const v1Config = toV1Format(v2Update)
    const existingAgent = parsed[agentsKey].primary

    // Check if prompt is file reference
    const fileMatch = existingAgent.prompt?.match(/^\{file:(.+)\}$/)
    if (fileMatch && v1Config.prompt) {
      const filePath = fileMatch[1]
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(testDir, filePath)

      // Write prompt to file
      await fs.writeFile(absolutePath, v1Config.prompt)

      // Keep the file reference
      v1Config.prompt = existingAgent.prompt
    }

    const merged = { ...existingAgent, ...v1Config }

    const edits = jsonc.modify(text, [agentsKey, "primary"], merged, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    })

    text = jsonc.applyEdits(text, edits)
    await fs.writeFile(configPath, text)

    const result = await fs.readFile(configPath, "utf-8")
    const resultParsed = jsonc.parse(result)

    // Verify file reference is preserved
    expect(resultParsed.agent.primary.prompt).toBe("{file:./prompt.md}")
    expect(resultParsed.agent.primary.description).toBe("Updated description")

    // Verify prompt file was updated
    const promptContent = await fs.readFile(promptPath, "utf-8")
    expect(promptContent).toBe("Updated prompt content")
  })

  test("V1 format with multiple agents and comments", async () => {
    const configPath = path.join(testDir, "opencode.json")

    const initial = `{
  // V1 agent team
  "agent": {
    "primary": {
      "model": "openai/gpt-4",
      "temperature": 0.7,
      "prompt": "Primary agent",
      "mode": "primary"
    },
    "helper": {
      // Helper agent for subtasks
      "model": "openai/gpt-3.5-turbo",
      "temperature": 0.5,
      "prompt": "Helper agent",
      "mode": "subagent",
      "disable": false
    }
  },
  "default_agent": "primary"
}
`
    await fs.writeFile(configPath, initial)

    let text = await fs.readFile(configPath, "utf-8")
    const parsed = jsonc.parse(text)

    const isV1 = parsed.agent !== undefined
    const agentsKey = "agent"

    // Update helper agent
    const v2Update = {
      description: "Updated helper description",
      disabled: true,
    }

    const toV1Format = (config: any) => {
      const v1: any = {}
      if (config.description !== undefined) {
        v1.description = config.description
      }
      if (config.disabled !== undefined) {
        v1.disable = config.disabled
      }
      return v1
    }

    const v1Config = toV1Format(v2Update)
    const existingAgent = parsed[agentsKey].helper
    const merged = { ...existingAgent, ...v1Config }

    const edits = jsonc.modify(text, [agentsKey, "helper"], merged, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    })

    text = jsonc.applyEdits(text, edits)
    await fs.writeFile(configPath, text)

    const result = await fs.readFile(configPath, "utf-8")
    const resultParsed = jsonc.parse(result)

    // Verify V1 structure preserved
    expect(resultParsed.agent).toBeDefined()
    expect(resultParsed.agent.helper.description).toBe("Updated helper description")
    expect(resultParsed.agent.helper.disable).toBe(true)
    expect(resultParsed.agent.helper.model).toBe("openai/gpt-3.5-turbo")
    expect(resultParsed.agent.primary.model).toBe("openai/gpt-4")

    // Verify top-level comments preserved (inline comments within modified objects may not be)
    expect(result).toContain("// V1 agent team")
  })
})
