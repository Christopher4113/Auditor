/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as advance from "../advance.js";
import type * as agent from "../agent.js";
import type * as agent_fake from "../agent/fake.js";
import type * as agent_instructions from "../agent/instructions.js";
import type * as agent_matcher from "../agent/matcher.js";
import type * as api_ from "../api.js";
import type * as audit from "../audit.js";
import type * as close from "../close.js";
import type * as controls from "../controls.js";
import type * as controls_rules from "../controls/rules.js";
import type * as controls_stub from "../controls/stub.js";
import type * as crons from "../crons.js";
import type * as human from "../human.js";
import type * as inject from "../inject.js";
import type * as ledger from "../ledger.js";
import type * as retrieval from "../retrieval.js";
import type * as retrievalClient from "../retrievalClient.js";
import type * as seed from "../seed.js";
import type * as tools from "../tools.js";
import type * as trace from "../trace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  advance: typeof advance;
  agent: typeof agent;
  "agent/fake": typeof agent_fake;
  "agent/instructions": typeof agent_instructions;
  "agent/matcher": typeof agent_matcher;
  api: typeof api_;
  audit: typeof audit;
  close: typeof close;
  controls: typeof controls;
  "controls/rules": typeof controls_rules;
  "controls/stub": typeof controls_stub;
  crons: typeof crons;
  human: typeof human;
  inject: typeof inject;
  ledger: typeof ledger;
  retrieval: typeof retrieval;
  retrievalClient: typeof retrievalClient;
  seed: typeof seed;
  tools: typeof tools;
  trace: typeof trace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
