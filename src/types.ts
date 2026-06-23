export interface Observation {
  content: string;
  createdAt: string; // ISO timestamp
  confidence?: number; // 0-1
  source?: string;
}

export interface Entity {
  name: string;
  entityType: string;
  observations: Observation[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  metadata?: Record<string, unknown>;
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

export interface ObservationAddition {
  entityName: string;
  contents: (string | Partial<Observation>)[];
}

export interface ObservationDeletion {
  entityName: string;
  observations: string[];
}

export interface RelationDeletion {
  from: string;
  to: string;
  relationType: string;
}

export interface KnowledgeGraph {
  entities: Map<string, Entity>;
  relations: Relation[];
}

export interface GraphTraversalResult {
  entities: Entity[];
  relations: Relation[];
  depthReached: number;
  startEntity: string;
}
