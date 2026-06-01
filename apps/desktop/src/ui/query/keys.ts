// Factory de query keys. Convention :
//   1er segment = nom de feature (string littéral)
//   2e segment = scope ("list" / "detail" / "search" / …)
//   suivants  = paramètres qui invalident une entrée (channel, id, query…)
//
// Le `channel` est systématiquement inclus dans les keys des données
// channel-scoped : changer de canal ⇒ nouvelle key ⇒ nouveau fetch, et
// l'ancien cache reste disponible (retour instantané sur re-switch dans
// `gcTime`).
export const qk = {
  templates: {
    list: (channel: string) => ["templates", "list", channel] as const,
    detail: (channel: string, ref: string) =>
      ["templates", "detail", channel, ref] as const,
  },
  skills: {
    list: (channel: string) => ["skills", "list", channel] as const,
  },
  artifactSchemas: {
    list: (channel: string) => ["artifact-schemas", "list", channel] as const,
  },
  parsers: {
    // forKey = `${typeId}@${version}` ou "" pour "tous"
    list: (channel: string, forKey: string) =>
      ["parsers", "list", channel, forKey] as const,
  },
  instances: {
    // query = "" pour la liste complète, sinon le terme de recherche.
    list: (channel: string, query: string) =>
      ["instances", "list", channel, query] as const,
  },
  awaitingHuman: {
    list: (channel: string) => ["awaiting-human", "list", channel] as const,
  },
  schedules: {
    list: (channel: string) => ["schedules", "list", channel] as const,
  },
} as const;
