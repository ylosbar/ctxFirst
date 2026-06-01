// Importing a feature's contributions file is enough to trigger registration —
// each call `workbenchRegistry.register*` runs as a side-effect at module load.
import "../features/overview/contributions";
import "../features/explorer/contributions";
import "../features/runs/contributions";
import "../features/schedules/contributions";
import "../features/skills/contributions";
import "../features/templates/contributions";
import "../features/artifact-schemas/contributions";
import "../features/chat/contributions";
import "../features/terminal/contributions";
import "../features/settings/contributions";
