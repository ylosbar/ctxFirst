import type { ArtifactSchemaRegistry } from "../ports/outbound/artifact-schema-registry";
import type { SaveUserArtifactSchema } from "../../domain/artifact-schema";

type Deps = { artifactSchemas: ArtifactSchemaRegistry };

export type SaveArtifactSchema = (input: SaveUserArtifactSchema) => Promise<void>;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export const makeSaveArtifactSchema =
  ({ artifactSchemas }: Deps): SaveArtifactSchema =>
  async (input) => {
    const id = String(input.id ?? "").trim();
    const version = String(input.version ?? "").trim();
    const name = String(input.name ?? "").trim();
    if (!id) throw new Error("artifact type id is required");
    if (!version) throw new Error("artifact type version is required");
    if (!name) throw new Error("artifact type name is required");
    if (!isPlainObject(input.simplifiedSchema)) {
      throw new Error(
        "simplifiedSchema must be a JSON Schema object (got " +
          (input.simplifiedSchema === null
            ? "null"
            : Array.isArray(input.simplifiedSchema)
              ? "array"
              : typeof input.simplifiedSchema) +
          ")",
      );
    }
    await artifactSchemas.save({ ...input, id, version, name });
  };
