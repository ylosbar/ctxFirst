import type { ArtifactSchemaRegistry } from "../ports/outbound/artifact-schema-registry";
import type { ArtifactSchemaRecord } from "../../domain/artifact-schema";

type Deps = { artifactSchemas: ArtifactSchemaRegistry };

export type ListArtifactSchemas = () => Promise<ReadonlyArray<ArtifactSchemaRecord>>;

export const makeListArtifactSchemas =
  ({ artifactSchemas }: Deps): ListArtifactSchemas =>
  async () =>
    artifactSchemas.list();
