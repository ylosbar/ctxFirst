/**
 * Layout d'éditeur de template — donnée satellite purement présentationnelle.
 * Co-localisée avec la ligne `wf_templates` mais transitée par ses propres
 * IPCs et son propre couple de méthodes de port (cf. spec). Le type domaine
 * `WorkflowTemplate` reste inchangé.
 */

export type NodePosition = { x: number; y: number };

export type NodeSize = { width: number; height: number };

export type ViewportState = { x: number; y: number; zoom: number };

/**
 * Position persistée d'une step node. Si `parentId` est défini, `x`/`y` sont
 * relatifs au groupe parent (convention React Flow pour les sous-flows) ;
 * sinon ils sont absolus dans le canvas.
 */
export type NodePositionEntry = NodePosition & {
  parentId?: string;
};

/**
 * Groupe visuel (style ComfyUI). L'appartenance d'une step node à un groupe
 * est une vraie relation parent/enfant — `parentId` sur l'entrée de position.
 * Les anciens layouts (sans `parentId`) sont migrés au chargement par
 * containment positionnel du centre de la node dans le bbox du groupe.
 */
export type GroupLayout = {
  id: string;
  position: NodePosition;
  size: NodeSize;
  label?: string;
};

/**
 * Note post-it libre du canvas — donnée purement présentationnelle, au même
 * titre qu'un GroupLayout. Position absolue dans le canvas (les notes ne sont
 * pas parentées à un groupe ni à une step). `text` est le contenu brut du
 * textarea. `color` réserve une palette future ; un seul thème suffit pour la v1.
 */
export type StickyNoteLayout = {
  id: string;
  position: NodePosition;
  size: NodeSize;
  text: string;
  color?: string;
};

export type TemplateLayout = {
  /** Map stepId → position (relative si parentId, absolue sinon). Steps absents = fallback auto-layout BFS. */
  positions: Record<string, NodePositionEntry>;
  /** Groupes visuels. Absent ou vide = pas de groupes. */
  groups?: ReadonlyArray<GroupLayout>;
  /** Notes post-it libres. Absent ou vide = pas de notes (rétro-compat layouts legacy). */
  stickyNotes?: ReadonlyArray<StickyNoteLayout>;
  /** Pan + zoom du canvas. Optionnel : si absent, `fitView` au load. */
  viewport?: ViewportState;
  /** ISO-8601 — diagnostic et debounce-anti-glitch. */
  updatedAt: string;
};
