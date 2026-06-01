import type { ArtifactSchemaRegistry } from "../ports/outbound/artifact-schema-registry";
import type { ArtifactSchemaRef } from "../../domain/artifact-schema";

type Deps = { artifactSchemas: ArtifactSchemaRegistry };

export type DeleteArtifactSchema = (ref: ArtifactSchemaRef) => Promise<void>;

export const makeDeleteArtifactSchema =
  ({ artifactSchemas }: Deps): DeleteArtifactSchema =>
  async (ref) => {
    const id = String(ref?.id ?? "").trim();
    const version = String(ref?.version ?? "").trim();
    if (!id || !version) {
      throw new Error("artifact type ref requires id and version");
    }
    await artifactSchemas.remove({ id, version });
  };
