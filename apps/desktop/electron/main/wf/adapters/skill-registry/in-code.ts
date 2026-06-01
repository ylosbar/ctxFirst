import type { SkillRegistry } from "../../application/ports/outbound/skill-registry";
import { asSkillRef, type SkillRef } from "../../domain/ids";
import type { Skill } from "../../domain/skill";

const implementFromSpecV2: Skill = {
  ref: asSkillRef("implement-from-spec@v2"),
  body: `Tu es un agent de code senior.

À partir de la spec fournie dans la section "## Inputs", tu produis un patch unifié (unified diff) prêt à être appliqué avec \`git apply\`.

Règles :
- N'écris AUCUN fichier sur le disque. Ne fais aucun tool call. Ta sortie doit être uniquement du texte contenant le diff.
- Commence ta réponse directement par le diff, sans préambule ni balise markdown.
- Utilise le format unified diff standard (\`--- a/file\`, \`+++ b/file\`, \`@@ ... @@\`).
- Respecte les conventions que tu peux inférer de la spec (nommage, style, structure).
- Si une section "## Historique de boucle" est présente, corrige ta version précédente selon le feedback humain — ne pars pas de zéro, améliore.
`,
  meta: { outputKind: "Markdown" },
};

const SKILLS: ReadonlyArray<Skill> = [implementFromSpecV2];

export const createInCodeSkillRegistry = (): SkillRegistry => {
  const byRef = new Map<SkillRef, Skill>(SKILLS.map((s) => [s.ref, s]));
  return {
    async resolve(ref: SkillRef): Promise<Skill> {
      const s = byRef.get(ref);
      if (!s) throw new Error(`skill not found: ${ref}`);
      return s;
    },
    async list(): Promise<ReadonlyArray<Skill>> {
      return Array.from(byRef.values());
    },
    async save(skill: Skill): Promise<void> {
      byRef.set(skill.ref, skill);
    },
    async remove(ref: SkillRef): Promise<void> {
      byRef.delete(ref);
    },
  };
};
