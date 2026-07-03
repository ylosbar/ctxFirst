import { useMemo } from "react";
import useWorkflowTemplates from "../../hooks/useWorkflowTemplates";
import {
  collectSkillConsumers,
  type SkillConsumer,
} from "../../../application/use-cases/collect-skill-consumers";

type UseSkillConsumers = {
  consumers: ReadonlyArray<SkillConsumer>;
  loading: boolean;
};

/**
 * Templates in the active channel that reference `skillRef` through a step's
 * `config.skillRef`. `skillRef === null` (a brand-new skill with no persisted
 * ref) short-circuits to an empty list. Memoized on `(skillRef, templates)`;
 * `useWorkflowTemplates` is react-query cached per channel, so the data is
 * usually already warm when a skill is opened.
 */
const useSkillConsumers = (skillRef: string | null): UseSkillConsumers => {
  const { templates, loading } = useWorkflowTemplates();
  const consumers = useMemo(
    () => (skillRef ? collectSkillConsumers(skillRef, templates) : []),
    [skillRef, templates],
  );
  return { consumers, loading };
};

export default useSkillConsumers;
