import type { AgentEvent } from "@tutti-os/agent-acp-kit";
import { describe, expect, it } from "vitest";

import { adaptLocalAgentEvent } from "./local-agent-events.js";

const now = () => "2026-06-17T00:00:00.000Z";

function adapt(event: AgentEvent) {
  return adaptLocalAgentEvent({
    event,
    messageId: "message-1",
    now,
    runId: "run-1",
  });
}

describe("adaptLocalAgentEvent", () => {
  it("converts provider-native question tools into assistant text", () => {
    const events = adapt({
      type: "tool_call",
      id: "question-1",
      name: "AskUserQuestion",
      input: {
        questions: [
          {
            header: "Topic",
            question: "Which topic should the carousel use?",
            options: [
              {
                label: "Product launch",
                description: "Use a launch announcement theme.",
              },
            ],
          },
        ],
      },
    } as AgentEvent);

    expect(events).toEqual([
      {
        type: "message.delta",
        runId: "run-1",
        messageId: "message-1",
        delta:
          "1. Topic: Which topic should the carousel use?\n- Product launch: Use a launch announcement theme.",
        timestamp: now(),
      },
    ]);
  });

  it("suppresses provider-native question tool results", () => {
    const events = adapt({
      type: "tool_result",
      id: "question-1",
      name: "AskUserQuestion",
      isError: true,
      output: {
        message: "Tool execution failed.",
      },
    } as AgentEvent);

    expect(events).toEqual([]);
  });

  it("suppresses the result paired with an internal skill read", () => {
    const suppressedToolCallIds = new Set<string>();
    const sharedInput = {
      messageId: "message-1",
      now,
      runId: "run-1",
      suppressedToolCallIds,
    };

    expect(
      adaptLocalAgentEvent({
        ...sharedInput,
        event: {
          type: "tool_call",
          id: "skill-read-1",
          name: "Bash",
          input: {
            command: "sed -n '1,240p' workspace-skills/imagegen/SKILL.md",
          },
        } as AgentEvent,
      }),
    ).toEqual([]);
    expect(suppressedToolCallIds).toEqual(new Set(["skill-read-1"]));

    expect(
      adaptLocalAgentEvent({
        ...sharedInput,
        event: {
          type: "tool_result",
          id: "skill-read-1",
          name: "Bash",
          output: {
            output: "---\nname: imagegen\ndescription: generated image guidance",
          },
        } as AgentEvent,
      }),
    ).toEqual([]);
    expect(suppressedToolCallIds).toEqual(new Set());
  });
});
