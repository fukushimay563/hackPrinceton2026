// Deterministic "policy" chat model for MOCK MODE (no API key needed).
// It drives the real Deep Agents runtime — planning, `task` delegation to isolated
// subagents, tool calls, human-approval interrupts — with a fixed, auditable script.
// In real mode the same agents run on Gemini instead.
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

export type Policy = (messages: BaseMessage[], ctx: { system: string; toolResults: BaseMessage[]; lastHuman: string }) => AIMessage;

/** System content can be a string or an array of content blocks. */
export function contentText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (typeof b === "string" ? b : ((b as { text?: string })?.text ?? ""))).join("");
  return "";
}

export class PolicyChatModel extends BaseChatModel {
  constructor(private policy: Policy) {
    super({});
  }

  _llmType() {
    return "firstfunds-policy";
  }

  // Tool schemas are known to the policy already; binding is a no-op.
  bindTools() {
    return this as unknown as ReturnType<BaseChatModel["bindTools"] & ((...a: never[]) => never)>;
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const system = messages.filter((m) => m.getType() === "system").map((m) => contentText(m.content)).join("\n");
    const humans = messages.filter((m) => m.getType() === "human");
    const lastHumanIdx = messages.lastIndexOf(humans[humans.length - 1]);
    const toolResults = messages.slice(lastHumanIdx + 1).filter((m) => m.getType() === "tool");
    const msg = this.policy(messages, { system, toolResults, lastHuman: contentText(humans[humans.length - 1]?.content) });
    return { generations: [{ text: contentText(msg.content), message: msg }] };
  }
}
