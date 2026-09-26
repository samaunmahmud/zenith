import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { config, type ModelTier } from "../config.js";
import { CostTracker, estimateCostUsd } from "./costs.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const tf = config.tokenFactory();
    // Token Factory is OpenAI-compatible, so the official SDK works by swapping the base URL.
    client = new OpenAI({ apiKey: tf.apiKey, baseURL: tf.baseURL, timeout: 120_000, maxRetries: 2 });
  }
  return client;
}

export function modelFor(tier: ModelTier): string {
  return config.tokenFactory().models[tier];
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly agent: string,
    readonly issues: string[] = []
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/**
 * Pull the JSON object out of a model reply. Reasoning models sometimes wrap the
 * answer in <think> blocks or markdown fences even when asked for JSON only.
 */
export function extractJson(text: string): unknown {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) cleaned = fenced[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object found in the model reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Models where the endpoint rejected json_schema; we fall back to json_object for them.
const noSchemaSupport = new Set<string>();

interface RawCall {
  agent: string;
  tier: ModelTier;
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  tracker?: CostTracker;
  attempt?: number;
}

/** One chat completion with latency, token and cost tracking. Returns the text content. */
export async function chat(call: RawCall): Promise<string> {
  const model = modelFor(call.tier);
  const price = config.pricing()[call.tier];
  const useSchema = call.jsonSchema && !noSchemaSupport.has(model);

  const responseFormat = call.jsonSchema
    ? useSchema
      ? { type: "json_schema" as const, json_schema: { name: call.jsonSchema.name, schema: call.jsonSchema.schema } }
      : { type: "json_object" as const }
    : undefined;

  const started = Date.now();
  try {
    const res = await getClient().chat.completions.create({
      model,
      messages: call.messages,
      temperature: call.temperature ?? 0.3,
      max_tokens: call.maxTokens ?? 8192,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    });
    const latencyMs = Date.now() - started;
    const promptTokens = res.usage?.prompt_tokens ?? 0;
    const completionTokens = res.usage?.completion_tokens ?? 0;
    call.tracker?.record({
      agent: call.agent,
      model,
      tier: call.tier,
      promptTokens,
      completionTokens,
      latencyMs,
      estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens, price),
      attempt: call.attempt ?? 1,
      ok: true,
    });
    return res.choices[0]?.message?.content ?? "";
  } catch (err) {
    // If the endpoint doesn't accept json_schema for this model, retry the same call with json_object.
    if (useSchema && err instanceof OpenAI.APIError && err.status === 400 && /response_format|json_schema|schema/i.test(err.message)) {
      noSchemaSupport.add(model);
      return chat(call);
    }
    throw err;
  }
}

export interface StructuredCall<S extends z.ZodTypeAny> {
  agent: string;
  tier: ModelTier;
  system: string;
  user: string;
  schema: S;
  schemaName: string;
  temperature?: number;
  tracker?: CostTracker;
  /** Extra checks beyond the schema (e.g. "no invented numbers"). Return a list of problems. */
  check?: (value: z.infer<S>) => string[];
}

/**
 * Ask a model for JSON matching a Zod schema. Validate the reply; on failure, retry ONCE
 * with the validation errors fed back. If that fails too, throw an LlmError (callers turn
 * it into a clean error state instead of crashing).
 */
export async function callStructured<S extends z.ZodTypeAny>(call: StructuredCall<S>): Promise<z.infer<S>> {
  const jsonSchema = zodToJsonSchema(call.schema, { $refStrategy: "none" }) as Record<string, unknown>;
  delete jsonSchema.$schema;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: call.system },
    { role: "user", content: call.user },
  ];

  let issues: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await chat({
      agent: call.agent,
      tier: call.tier,
      messages,
      temperature: call.temperature,
      jsonSchema: { name: call.schemaName, schema: jsonSchema },
      tracker: call.tracker,
      attempt,
    });

    issues = validate(text, call.schema, call.check);
    if (issues.length === 0) return call.schema.parse(extractJson(text));

    if (call.tracker) {
      const last = call.tracker.calls[call.tracker.calls.length - 1];
      if (last) last.ok = false;
    }
    messages.push(
      { role: "assistant", content: text },
      {
        role: "user",
        content:
          "Your previous reply was rejected by the validator:\n" +
          issues.map((i) => `- ${i}`).join("\n") +
          "\nReturn a corrected JSON object only. No prose, no markdown fences.",
      }
    );
  }
  throw new LlmError(`${call.agent} returned invalid output twice`, call.agent, issues);
}

function validate<S extends z.ZodTypeAny>(text: string, schema: S, check?: (v: z.infer<S>) => string[]): string[] {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (e) {
    return [`Reply was not valid JSON: ${(e as Error).message}`];
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  }
  return check ? check(parsed.data) : [];
}
