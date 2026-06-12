export type Migration = {
  version: number;
  sql: string;
};

export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE wf_events (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id      TEXT NOT NULL UNIQUE,
        instance_id   TEXT NOT NULL,
        type          TEXT NOT NULL,
        payload_json  TEXT NOT NULL,
        occurred_at   TEXT NOT NULL
      );
      CREATE INDEX idx_wf_events_instance ON wf_events(instance_id, id);

      CREATE TABLE wf_artifacts (
        id             TEXT PRIMARY KEY,
        kind           TEXT NOT NULL,
        hash           TEXT NOT NULL,
        storage_ref    TEXT NOT NULL,
        metadata_json  TEXT NOT NULL,
        created_at     TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_wf_artifacts_hash ON wf_artifacts(hash);

      CREATE TABLE wf_runs (
        id            TEXT PRIMARY KEY,
        step_exec_id  TEXT NOT NULL,
        provider      TEXT NOT NULL,
        model         TEXT NOT NULL,
        prompt_hash   TEXT NOT NULL,
        tokens_in     INTEGER NOT NULL,
        tokens_out    INTEGER NOT NULL,
        cost_usd      REAL,
        latency_ms    INTEGER NOT NULL,
        output_ref    TEXT,
        created_at    TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE wf_templates (
        id            TEXT NOT NULL,
        version       TEXT NOT NULL,
        name          TEXT NOT NULL,
        entry_step    TEXT NOT NULL,
        exit_steps    TEXT NOT NULL,
        steps         TEXT NOT NULL,
        transitions   TEXT NOT NULL,
        status        TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        PRIMARY KEY (id, version)
      );
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE wf_skills (
        ref          TEXT PRIMARY KEY,
        body         TEXT NOT NULL,
        meta_json    TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE wf_llm_session_events (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        step_exec_id  TEXT NOT NULL,
        seq           INTEGER NOT NULL,
        session_id    TEXT,
        payload_json  TEXT NOT NULL,
        UNIQUE (step_exec_id, seq)
      );
      CREATE INDEX idx_wf_llm_session_events_step ON wf_llm_session_events(step_exec_id, seq);
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE app_settings (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
    `,
  },
  {
    version: 6,
    sql: `
      ALTER TABLE wf_templates ADD COLUMN description TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 7,
    sql: `
      ALTER TABLE wf_templates ADD COLUMN variables TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 8,
    sql: `
      ALTER TABLE wf_templates ADD COLUMN layout TEXT;
    `,
  },
  {
    version: 9,
    sql: `
      CREATE TABLE wf_artifact_types (
        id                     TEXT NOT NULL,
        version                TEXT NOT NULL,
        name                   TEXT NOT NULL,
        description            TEXT NOT NULL DEFAULT '',
        raw_schema_json        TEXT,
        simplified_schema_json TEXT NOT NULL,
        sample_raw             TEXT,
        created_at             TEXT NOT NULL,
        PRIMARY KEY (id, version)
      );

      CREATE TABLE wf_parsers (
        id             TEXT NOT NULL,
        version        TEXT NOT NULL,
        type_id        TEXT NOT NULL,
        type_version   TEXT NOT NULL,
        mode           TEXT NOT NULL CHECK(mode IN ('declarative', 'code')),
        body_json      TEXT NOT NULL,
        meta_json      TEXT NOT NULL DEFAULT '{}',
        created_at     TEXT NOT NULL,
        PRIMARY KEY (id, version),
        FOREIGN KEY (type_id, type_version) REFERENCES wf_artifact_types(id, version)
      );
      CREATE INDEX idx_wf_parsers_type ON wf_parsers(type_id, type_version);

      CREATE TABLE wf_artifact_type_active_parser (
        type_id        TEXT NOT NULL,
        type_version   TEXT NOT NULL,
        parser_id      TEXT NOT NULL,
        parser_version TEXT NOT NULL,
        PRIMARY KEY (type_id, type_version),
        FOREIGN KEY (type_id, type_version) REFERENCES wf_artifact_types(id, version),
        FOREIGN KEY (parser_id, parser_version) REFERENCES wf_parsers(id, version)
      );
    `,
  },
  {
    version: 10,
    sql: `
      -- Per-(plugin, version) grants. A row exists once the user has answered
      -- the authorization dialog at least once for that version. A new
      -- version of the plugin forces a re-prompt.
      CREATE TABLE plugin_grants (
        plugin_id   TEXT NOT NULL,
        version     TEXT NOT NULL,
        enabled     INTEGER NOT NULL DEFAULT 1,  -- 0/1 flag, drives "load on next boot"
        permissions TEXT NOT NULL DEFAULT '[]',  -- JSON array of granted permission ids
        decided_at  TEXT NOT NULL,
        PRIMARY KEY (plugin_id, version)
      );

      -- Audit log of parser executions (code mode).
      -- Captures input/output hashes (not contents) so we can correlate runs
      -- with cost/perf data without storing potentially sensitive payloads.
      CREATE TABLE wf_parser_runs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        parser_id    TEXT NOT NULL,
        parser_ver   TEXT NOT NULL,
        mode         TEXT NOT NULL,
        input_hash   TEXT NOT NULL,
        output_hash  TEXT,
        duration_ms  INTEGER NOT NULL,
        ok           INTEGER NOT NULL,            -- 0/1
        error        TEXT,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX idx_wf_parser_runs_parser
        ON wf_parser_runs(parser_id, parser_ver, created_at DESC);
    `,
  },
  {
    version: 11,
    // Rename of the step kind `"llm.invoke"` → `"claude_code.invoke"`. The kind
    // is baked into two JSON-text columns (templates' `steps`, events'
    // `payload_json` for `StepStarted`); SQLite's REPLACE on the literal token
    // is sufficient because the column values are produced by `JSON.stringify`
    // (no spacing) and the substring is distinctive enough not to collide.
    sql: `
      UPDATE wf_templates
         SET steps = REPLACE(steps, '"kind":"llm.invoke"', '"kind":"claude_code.invoke"')
       WHERE steps LIKE '%"kind":"llm.invoke"%';

      UPDATE wf_events
         SET payload_json = REPLACE(payload_json, '"kind":"llm.invoke"', '"kind":"claude_code.invoke"')
       WHERE payload_json LIKE '%"kind":"llm.invoke"%';
    `,
  },
  {
    version: 12,
    // Introduces channels. `channels` lists every user-defined context; each
    // scopable table gains a nullable `channel_id` column (NULL = global,
    // visible from any channel). The seed `"personal"` is the default
    // context: every pre-existing row is backfilled to it so nothing remains
    // unassigned. Built-ins seeded by the app code also land in `"personal"`
    // — by design, V1 wants "nothing without assignment" rather than an
    // implicit global pool.
    //
    // The InstanceStarted event payload also gets a `channelId` field at
    // emission time (not via migration — events are immutable), and the
    // projection treats absence as `"personal"` for backward compatibility.
    sql: `
      CREATE TABLE channels (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        description  TEXT NOT NULL DEFAULT '',
        color        TEXT,
        icon         TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      INSERT INTO channels (id, name, description, created_at, updated_at)
      VALUES ('personal', 'Personal', 'Channel par défaut.',
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

      ALTER TABLE wf_templates       ADD COLUMN channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL;
      ALTER TABLE wf_skills          ADD COLUMN channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL;
      ALTER TABLE wf_artifact_types  ADD COLUMN channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL;
      ALTER TABLE wf_parsers         ADD COLUMN channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL;

      UPDATE wf_templates       SET channel_id = 'personal' WHERE channel_id IS NULL;
      UPDATE wf_skills          SET channel_id = 'personal' WHERE channel_id IS NULL;
      UPDATE wf_artifact_types  SET channel_id = 'personal' WHERE channel_id IS NULL;
      UPDATE wf_parsers         SET channel_id = 'personal' WHERE channel_id IS NULL;

      CREATE INDEX idx_wf_templates_channel       ON wf_templates(channel_id);
      CREATE INDEX idx_wf_skills_channel          ON wf_skills(channel_id);
      CREATE INDEX idx_wf_artifact_types_channel  ON wf_artifact_types(channel_id);
      CREATE INDEX idx_wf_parsers_channel         ON wf_parsers(channel_id);
    `,
  },
  {
    version: 13,
    // User-defined folders that let the Explorer organise resources per
    // channel + section (runs / templates / prompts / artifact-types).
    // `explorer_folder_items` is the resource → folder assignment with a
    // composite PK that enforces "at most one folder per resource". The
    // `resource_id` column is intentionally not a FK (runs live in
    // `wf_events`, templates use `id@version`…). Cleanup of stale rows is
    // performed lazily by the renderer — see the spec at
    // `specs/explorer-folders-dnd.md`.
    sql: `
      CREATE TABLE explorer_folders (
        id           TEXT PRIMARY KEY,
        channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        section      TEXT NOT NULL CHECK(section IN ('runs','templates','prompts','artifact-types')),
        parent_id    TEXT REFERENCES explorer_folders(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      CREATE INDEX idx_explorer_folders_scope ON explorer_folders(channel_id, section, parent_id);

      CREATE TABLE explorer_folder_items (
        channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        section      TEXT NOT NULL CHECK(section IN ('runs','templates','prompts','artifact-types')),
        resource_id  TEXT NOT NULL,
        folder_id    TEXT NOT NULL REFERENCES explorer_folders(id) ON DELETE CASCADE,
        assigned_at  TEXT NOT NULL,
        PRIMARY KEY (channel_id, section, resource_id)
      );
      CREATE INDEX idx_explorer_folder_items_folder ON explorer_folder_items(folder_id);
    `,
  },
  {
    version: 14,
    // Adds optional image-based icons for channels. Files live under
    // `userData/channel-icons/`. `icon_image_path` stores the absolute path,
    // `icon_image_mime` the mime (always image/png or image/jpeg). Both NULL
    // means "no uploaded image — render the lucide icon (or fallback)".
    // Pre-existing channels are not migrated (no uploaded image by design).
    sql: `
      ALTER TABLE channels ADD COLUMN icon_image_path TEXT;
      ALTER TABLE channels ADD COLUMN icon_image_mime TEXT
        CHECK (icon_image_mime IN ('image/png','image/jpeg'));
    `,
  },
  {
    version: 15,
    // Index des conversations du chat global piloté par Pi. La conversation
    // elle-même vit dans un fichier JSONL géré par le SessionManager Pi
    // (`<userData>/pi-sessions/<id>.jsonl`) ; SQLite ne sert qu'à lister et
    // retrouver les sessions. `initial_context_json` snapshot le contexte de
    // vue qui était actif au moment de la création (peut être NULL si la
    // session a démarré depuis une vue sans contexte enregistré).
    sql: `
      CREATE TABLE chat_sessions (
        id                    TEXT PRIMARY KEY,
        title                 TEXT NOT NULL,
        created_at            TEXT NOT NULL,
        initial_context_json  TEXT,
        model                 TEXT NOT NULL,
        jsonl_path            TEXT NOT NULL UNIQUE
      );
      CREATE INDEX idx_chat_sessions_created_at ON chat_sessions(created_at DESC);
    `,
  },
  {
    version: 16,
    // Dossiers Explorer désormais type-agnostiques : on retire `section` (et son
    // CHECK + son index) de `explorer_folders`. La colonne `section` reste sur
    // `explorer_folder_items` — elle est désormais un tag de type de ressource
    // (run/template/prompt/artifact-type) qui empêche les collisions d'id entre
    // templates et artifact-types (qui partagent le format `id@version`).
    //
    // SQLite ne sait pas DROP COLUMN sous CHECK/index, donc rebuild de table.
    // `PRAGMA foreign_keys=OFF` est ignoré dans une transaction (et le runner
    // de migrations en ouvre une autour de chaque migration). Du coup le DROP
    // TABLE explorer_folders déclencherait ON DELETE CASCADE sur tous les
    // items — on sauvegarde puis on restaure pour préserver les assignations.
    sql: `
      -- Per-transaction equivalent of foreign_keys=OFF: defer FK validation
      -- until COMMIT. Required because (a) the self-FK on explorer_folders_new
      -- would otherwise fire on each row during the INSERT (children may
      -- precede parents), and (b) the brief window where the FK in
      -- explorer_folder_items points to a dropped table is OK only as long as
      -- the table is empty during that window — which it is, since we cleared
      -- it just above.
      PRAGMA defer_foreign_keys = ON;

      CREATE TEMP TABLE __saved_folder_items AS
        SELECT * FROM explorer_folder_items;
      DELETE FROM explorer_folder_items;

      CREATE TABLE explorer_folders_new (
        id           TEXT PRIMARY KEY,
        channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        parent_id    TEXT REFERENCES explorer_folders_new(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      INSERT INTO explorer_folders_new
        (id, channel_id, parent_id, name, created_at, updated_at)
      SELECT id, channel_id, parent_id, name, created_at, updated_at
        FROM explorer_folders;

      DROP TABLE explorer_folders;
      ALTER TABLE explorer_folders_new RENAME TO explorer_folders;
      CREATE INDEX idx_explorer_folders_scope ON explorer_folders(channel_id, parent_id);

      INSERT INTO explorer_folder_items
        (channel_id, section, resource_id, folder_id, assigned_at)
      SELECT channel_id, section, resource_id, folder_id, assigned_at
        FROM __saved_folder_items;
      DROP TABLE __saved_folder_items;
    `,
  },
  {
    version: 17,
    // Removed artifact kinds `TechSpec`, `CodePatch`, `QuestionList`, `Keyword`
    // are folded into `Markdown`. TechSpec / QuestionList / CodePatch were
    // alias-of-Markdown at the schema level (same `{format,body}` envelope),
    // so rewriting the kind label is enough. `Keyword` had a different
    // payload shape (`{value:string}`); on-disk artifact bytes already
    // written under that kind keep their old shape — only the kind reference
    // in metadata gets rewritten, since the renderer just displays the
    // content as text either way.
    //
    // Replacements target JSON tokens (`"key":"value"`) so prompt bodies or
    // description strings that happen to contain the words "TechSpec" etc.
    // are not corrupted. Step kinds (e.g. `"kind":"user.input"`) never
    // collide with artifact kind values, so the bare `"kind":"X"` pattern is
    // safe on both `steps` and event payloads.
    sql: (() => {
      const REMOVED = ["TechSpec", "CodePatch", "QuestionList", "Keyword"];
      const KEYS = ["kind", "outputKind", "inputKind", "itemKind"];
      const TABLES: ReadonlyArray<readonly [string, string]> = [
        ["wf_templates", "steps"],
        ["wf_templates", "variables"],
        ["wf_skills", "meta_json"],
        ["wf_events", "payload_json"],
      ];
      const stmts: string[] = [];
      for (const [table, column] of TABLES) {
        for (const key of KEYS) {
          for (const removed of REMOVED) {
            const from = `"${key}":"${removed}"`;
            const to = `"${key}":"Markdown"`;
            stmts.push(
              `UPDATE ${table} SET ${column} = REPLACE(${column}, '${from}', '${to}') WHERE ${column} LIKE '%${from}%';`,
            );
          }
        }
      }
      // `wf_artifacts.kind` is a bare column, not JSON.
      for (const removed of REMOVED) {
        stmts.push(
          `UPDATE wf_artifacts SET kind = 'Markdown' WHERE kind = '${removed}';`,
        );
      }
      return stmts.join("\n");
    })(),
  },
  {
    version: 18,
    // Removal of the "parser-as-option" mechanism (cf.
    // `specs/artifact-typing-overhaul.md` §Pilier B). The active-parser
    // pointer table is drained into an `app_settings` row that the template
    // registry consumes at load time to insert explicit `transform.run`
    // nodes between producers and LLM steps. The table is then dropped.
    //
    // The seed encodes kinds as `user:<id>@<version>` — the table never
    // discriminated user vs plugin sources at the SQL level, and active
    // parsers targeting plugin types were an uncommon path; users wanting
    // to preserve them can insert the `transform.run` node manually.
    sql: `
      INSERT INTO app_settings (key, value, updated_at)
      SELECT
        'parser_as_option_migration_seed',
        COALESCE(
          (
            SELECT json_group_array(
              json_object(
                'kind', 'user:' || type_id || '@' || type_version,
                'parserId', parser_id,
                'parserVersion', parser_version
              )
            )
            FROM wf_artifact_type_active_parser
          ),
          '[]'
        ),
        datetime('now')
      WHERE NOT EXISTS (
        SELECT 1 FROM app_settings WHERE key = 'parser_as_option_migration_seed'
      );

      DROP TABLE IF EXISTS wf_artifact_type_active_parser;
    `,
  },
  {
    version: 19,
    // Snapshot du base prompt système (persona + style) au moment de la
    // création de la session. NULL = composer avec DEFAULT_CHAT_BASE_PROMPT
    // au resume (cas des sessions créées avant cette migration et des
    // sessions où l'utilisateur n'a jamais personnalisé le prompt). La
    // section "tools disponibles" reste appliquée hors snapshot — voir
    // electron/main/chat/system-prompt.ts.
    sql: `ALTER TABLE chat_sessions ADD COLUMN system_prompt TEXT;`,
  },
  {
    version: 20,
    // Planifications cron : chaque ligne arme un timer côté main qui appelle
    // startInstance avec les seeds figés à la création (cf. spec
    // workflow-scheduler-cron.md). `channel_id` suit le pattern v12 :
    // ON DELETE SET NULL — supprimer un channel orphelinise ses schedules
    // (visibles partout) plutôt que de les détruire.
    sql: `
      CREATE TABLE wf_schedules (
        id                TEXT PRIMARY KEY,
        channel_id        TEXT REFERENCES channels(id) ON DELETE SET NULL,
        name              TEXT NOT NULL,
        template_ref      TEXT NOT NULL,
        cron              TEXT NOT NULL,
        timezone          TEXT,
        seeds_json        TEXT NOT NULL DEFAULT '[]',
        cwd               TEXT,
        enabled           INTEGER NOT NULL DEFAULT 1,
        last_run_at       TEXT,
        last_instance_id  TEXT,
        last_status       TEXT,
        last_error        TEXT,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      );
      CREATE INDEX idx_wf_schedules_channel ON wf_schedules(channel_id);
      CREATE INDEX idx_wf_schedules_enabled ON wf_schedules(enabled);
    `,
  },
  {
    version: 21,
    // Renomme la "fiche" d'un kind d'artefact : `Type` → `Schema` (cf.
    // `specs/artifact-type-vs-kind-naming.md`). Le concept `ArtifactKind`
    // (identifiant string qui voyage dans events/IPC/store) ne change pas —
    // seul le record/registry (la définition de schéma) est renommé. La
    // migration touche deux endroits :
    //
    //  1. La table `wf_artifact_types` → `wf_artifact_schemas`. SQLite met
    //     automatiquement à jour les FK de `wf_parsers(type_id, type_version)`
    //     lors du RENAME (cf. SQLite docs). L'index de canal n'est PAS auto-
    //     renommé : drop + recreate.
    //
    //  2. La valeur de discriminateur `section` dans `explorer_folder_items`
    //     passe de `'artifact-types'` à `'artifact-schemas'`. La table porte
    //     un CHECK constraint sur cette colonne — SQLite ne sait pas ALTER
    //     un CHECK, donc rebuild de table.
    sql: `
      PRAGMA defer_foreign_keys = ON;

      ALTER TABLE wf_artifact_types RENAME TO wf_artifact_schemas;
      DROP INDEX IF EXISTS idx_wf_artifact_types_channel;
      CREATE INDEX idx_wf_artifact_schemas_channel ON wf_artifact_schemas(channel_id);

      CREATE TABLE explorer_folder_items_new (
        channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        section      TEXT NOT NULL CHECK(section IN ('runs','templates','prompts','artifact-schemas')),
        resource_id  TEXT NOT NULL,
        folder_id    TEXT NOT NULL REFERENCES explorer_folders(id) ON DELETE CASCADE,
        assigned_at  TEXT NOT NULL,
        PRIMARY KEY (channel_id, section, resource_id)
      );

      INSERT INTO explorer_folder_items_new
        (channel_id, section, resource_id, folder_id, assigned_at)
      SELECT channel_id,
             CASE section WHEN 'artifact-types' THEN 'artifact-schemas' ELSE section END,
             resource_id, folder_id, assigned_at
        FROM explorer_folder_items;

      DROP TABLE explorer_folder_items;
      ALTER TABLE explorer_folder_items_new RENAME TO explorer_folder_items;
      CREATE INDEX idx_explorer_folder_items_folder ON explorer_folder_items(folder_id);
    `,
  },
  {
    version: 22,
    // §2 refinements — adds the `extends_kind` column to user-defined artifact
    // schemas so the registry can express subtype relationships (e.g. a user
    // record refining `String`). NULL = no parent (root descriptor). The
    // covariance walk in `portAccepts` reads this column transitively.
    sql: `
      ALTER TABLE wf_artifact_schemas ADD COLUMN extends_kind TEXT;
      CREATE INDEX idx_wf_artifact_schemas_extends ON wf_artifact_schemas(extends_kind);
    `,
  },
  {
    version: 23,
    // §3 — `LinearTicket` leaves the built-in seed and is republished by the
    // `linear` core plugin under the kind `plugin:linear:Ticket@v1`. The
    // payload bytes are unchanged (the simplified schema is structurally the
    // same); only the kind label moves namespace.
    //
    // Mirrors the v17 REPLACE pattern: target JSON tokens (`"key":"value"`) so
    // a free-text prompt or description containing the word "LinearTicket"
    // doesn't get corrupted. Step kinds (`"kind":"linear.fetch"`) don't
    // collide with artifact kind tokens, so the bare `"<key>":"LinearTicket"`
    // patterns are safe to apply across `wf_templates`, `wf_skills`,
    // `wf_events` and the bare `wf_artifacts.kind` column.
    sql: (() => {
      const FROM = "LinearTicket";
      const TO = "plugin:linear:Ticket@v1";
      const KEYS = ["kind", "outputKind", "inputKind", "itemKind"];
      const TABLES: ReadonlyArray<readonly [string, string]> = [
        ["wf_templates", "steps"],
        ["wf_templates", "variables"],
        ["wf_skills", "meta_json"],
        ["wf_events", "payload_json"],
      ];
      const stmts: string[] = [];
      for (const [table, column] of TABLES) {
        for (const key of KEYS) {
          const from = `"${key}":"${FROM}"`;
          const to = `"${key}":"${TO}"`;
          stmts.push(
            `UPDATE ${table} SET ${column} = REPLACE(${column}, '${from}', '${to}') WHERE ${column} LIKE '%${from}%';`,
          );
        }
        // PortSpec.kinds is an array — match the array element form too.
        const fromArr = `"${FROM}"`;
        const toArr = `"${TO}"`;
        // Constrain by neighbouring `"kinds":[` to avoid clobbering an
        // unrelated `"LinearTicket"` substring (defensive — that string only
        // ever appears as a kind value in the engine's serialisation).
        stmts.push(
          `UPDATE ${table} SET ${column} = REPLACE(${column}, '${fromArr}', '${toArr}') WHERE ${column} LIKE '%"kinds":%${fromArr}%';`,
        );
      }
      stmts.push(
        `UPDATE wf_artifacts SET kind = '${TO}' WHERE kind = '${FROM}';`,
      );
      return stmts.join("\n");
    })(),
  },
  {
    version: 24,
    // §5 content-addressing — adds the structural-hash column used as the
    // canonical equality key by `portAccepts`. NULL on existing rows means
    // "not yet computed"; the SQLite registry adapter backfills missing
    // hashes at construction time by re-resolving each row through
    // `computeStructuralHash` (cheap — one pass per boot, only until the
    // backfill writes the column). The index supports the `record:<hash>`
    // prefix lookup performed by `resolve()`.
    sql: `
      ALTER TABLE wf_artifact_schemas ADD COLUMN structural_hash TEXT;
      CREATE INDEX idx_wf_artifact_schemas_hash ON wf_artifact_schemas(structural_hash);
    `,
  },
  {
    version: 25,
    // §1 canonicalisation — rewrite legacy `MarkdownList` / `PathList` to
    // their `List<Markdown>` / `List<Path>` canonical form in the declarative
    // specs of templates and skills, plus the event log. Stops every freshly
    // opened variable from showing a "legacy alias" affordance forever.
    //
    // Scope is deliberately narrower than v23: `wf_artifacts.kind` is left
    // alone. Existing on-disk artifacts keep their legacy label and stay
    // readable through the alias the engine still seeds in
    // `BUILTIN_DESCRIPTORS` (spec §1.8 non-goal: retirer ces aliases du
    // moteur). Runners that still emit `MarkdownList` continue to work; only
    // the static template/skill declarations move forward.
    //
    // REPLACE pattern mirrors v23 (LinearTicket → plugin:linear:Ticket@v1):
    // tokens are matched as `"<key>":"<kind>"` to avoid clobbering free-text
    // descriptions that happen to mention `MarkdownList`, and the array form
    // `"kinds":[…"<kind>"…]` is matched only when the neighbouring
    // `"kinds":[` is present.
    sql: (() => {
      const REWRITES: ReadonlyArray<readonly [string, string]> = [
        ["MarkdownList", "List<Markdown>"],
        ["PathList", "List<Path>"],
      ];
      const KEYS = ["kind", "outputKind", "inputKind", "itemKind"];
      const TABLES: ReadonlyArray<readonly [string, string]> = [
        ["wf_templates", "steps"],
        ["wf_templates", "variables"],
        ["wf_skills", "meta_json"],
        ["wf_events", "payload_json"],
      ];
      const stmts: string[] = [];
      for (const [FROM, TO] of REWRITES) {
        for (const [table, column] of TABLES) {
          for (const key of KEYS) {
            const from = `"${key}":"${FROM}"`;
            const to = `"${key}":"${TO}"`;
            stmts.push(
              `UPDATE ${table} SET ${column} = REPLACE(${column}, '${from}', '${to}') WHERE ${column} LIKE '%${from}%';`,
            );
          }
          const fromArr = `"${FROM}"`;
          const toArr = `"${TO}"`;
          stmts.push(
            `UPDATE ${table} SET ${column} = REPLACE(${column}, '${fromArr}', '${toArr}') WHERE ${column} LIKE '%"kinds":%${fromArr}%';`,
          );
        }
      }
      return stmts.join("\n");
    })(),
  },
  {
    version: 26,
    // Kind discoverability (cf. `specs/kind-discoverability.md`) — adds a
    // nullable `sample_json` column to user-stored artifact schemas so an
    // author can attach a concrete payload to a kind, surfaced read-only by
    // the `KindPreview` UI. NULL on existing rows: the renderer auto-derives
    // a best-effort sample from `simplifiedSchema` (no backfill needed).
    sql: `
      ALTER TABLE wf_artifact_schemas ADD COLUMN sample_json TEXT;
    `,
  },
  {
    version: 27,
    // Drops the lucide-icon association on channels. A channel now carries at
    // most an optional uploaded image (`icon_image_path` / `icon_image_mime`,
    // added in v14); the per-channel lucide glyph name is gone. The stored
    // value (if any) is simply discarded — channels without an image fall back
    // to the generic Layers glyph in the renderer.
    sql: `
      ALTER TABLE channels DROP COLUMN icon;
    `,
  },
  {
    version: 28,
    // Typed-kind Markdown projection (cf.
    // `specs/typed-kind-rendered-markdown.md`) — adds a nullable
    // `markdown_template` column to user-stored artifact schemas. Holds an
    // optional `{{field}}` gabarit mapped to a `{ kind: "template" }` Markdown
    // projection at resolve time. NULL on existing rows: the kind falls back to
    // the generic chain in `renderArtifactMarkdown` (no backfill needed).
    sql: `
      ALTER TABLE wf_artifact_schemas ADD COLUMN markdown_template TEXT;
    `,
  },
  {
    version: 29,
    // Renames the built-in entry step kind `spec.input` → `user.input`. The
    // runner, its symbols and the picker catalog moved in code; this migration
    // rewrites the kind reference inside already-persisted JSON so existing
    // templates / skills / events keep resolving to the (now renamed) runner.
    //
    // Targets the JSON token `"kind":"spec.input"` so prompt bodies or
    // descriptions that merely contain the words "spec input" are untouched.
    // `spec.input` only ever appears under the `kind` key (never outputKind /
    // inputKind / itemKind), so the single `"kind":"X"` pattern is sufficient.
    sql: (() => {
      const from = `"kind":"spec.input"`;
      const to = `"kind":"user.input"`;
      const TABLES: ReadonlyArray<readonly [string, string]> = [
        ["wf_templates", "steps"],
        ["wf_skills", "meta_json"],
        ["wf_events", "payload_json"],
      ];
      return TABLES.map(
        ([table, column]) =>
          `UPDATE ${table} SET ${column} = REPLACE(${column}, '${from}', '${to}') WHERE ${column} LIKE '%${from}%';`,
      ).join("\n");
    })(),
  },
  {
    version: 30,
    // Records the cache-token breakdown of each LLM run (cf.
    // `specs/run-detail-tokens-cache-manquants.md`). With Claude Code prompt
    // caching, `tokens_in` only counts the uncached delta — the bulk of the real
    // input transits through `cache_read`. Persisting both lets the run-detail
    // token counter reflect the true input cost. Historical runs keep 0 (an
    // un-journalled usage can't be reconstructed).
    sql: `
      ALTER TABLE wf_runs ADD COLUMN cache_create INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE wf_runs ADD COLUMN cache_read   INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 31,
    // Read-time coercion (cf. `specs/techstrategy-artifact-types-solution.md`
    // §2.4, P3) — adds a nullable `coerce_from_json` column to user-stored
    // artifact schemas. Holds a serialised `{ fromVersion, patch }` declaring a
    // same-`id` predecessor version and a declarative reshape applied at read
    // time. NULL on existing rows (no coercion); no backfill. Orthogonal to
    // `structural_hash` — a coercion declaration is read-side metadata, never
    // part of the type's identity.
    sql: `
      ALTER TABLE wf_artifact_schemas ADD COLUMN coerce_from_json TEXT;
    `,
  },
];
