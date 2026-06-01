/**
 * A Skill is a named prompt template that a `claude_code.invoke` step uses as its
 * system prompt.
 */
import type { SkillRef } from "./ids";

/**
 * A resolved skill ready to be used as an LLM system prompt.
 *
 * @property ref Name of the skill.
 * @property body System-prompt text sent verbatim to the LLM.
 * @property meta Free-form metadata (target language, expected output kind…).
 */
export type Skill = {
  ref: SkillRef;
  body: string;
  meta: Readonly<Record<string, unknown>>;
};
