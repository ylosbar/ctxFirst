import LinearApiKeyRow from "../components/LinearApiKeyRow";
import GitLabTokenRow from "../components/GitLabTokenRow";

const IntegrationsPanel = () => {
  return (
    <section className="flex flex-col gap-6">
      <LinearApiKeyRow />
      <GitLabTokenRow />
    </section>
  );
};

export default IntegrationsPanel;
