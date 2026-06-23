import { Entity, Relation, KnowledgeGraph, ObservationAddition, ObservationDeletion, RelationDeletion, Observation, GraphTraversalResult } from './types.js';
import fs from 'fs/promises';
import path from 'path';

export class MemoryService {
  private graph: KnowledgeGraph;
  private storagePath: string;

  constructor(storagePath: string = '/tmp/mcp-memory-storage.json') {
    this.storagePath = storagePath;
    this.graph = {
      entities: new Map<string, Entity>(),
      relations: []
    };
    this.loadFromDisk();
  }

  private normalizeObservation(input: string | Partial<Observation>): Observation {
    if (typeof input === 'string') {
      return {
        content: input,
        createdAt: new Date().toISOString()
      };
    }
    return {
      content: input.content || '',
      createdAt: input.createdAt || new Date().toISOString(),
      confidence: input.confidence,
      source: input.source
    };
  }

  private async loadFromDisk() {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Reconstruct entities Map with migration for legacy data
      const now = new Date().toISOString();
      this.graph.entities = new Map(
        parsed.entities.map((e: any) => {
          // Migrate legacy observations (string[] -> Observation[])
          const observations: Observation[] = Array.isArray(e.observations)
            ? e.observations.map((obs: any) => {
                if (typeof obs === 'string') {
                  return { content: obs, createdAt: now };
                }
                return obs as Observation;
              })
            : [];
          
          return [
            e.name,
            {
              name: e.name,
              entityType: e.entityType,
              observations,
              createdAt: e.createdAt || now,
              updatedAt: e.updatedAt || now,
              metadata: e.metadata
            }
          ];
        })
      );
      this.graph.relations = parsed.relations || [];
    } catch (err) {
      // File doesn't exist or is corrupted, start with empty graph
      this.graph = {
        entities: new Map<string, Entity>(),
        relations: []
      };
    }
  }

  private async saveToDisk() {
    try {
      const entitiesArray = Array.from(this.graph.entities.entries()).map(([name, entity]) => ({
        name,
        entityType: entity.entityType,
        observations: entity.observations,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        metadata: entity.metadata
      }));
      
      const data = JSON.stringify({
        entities: entitiesArray,
        relations: this.graph.relations
      }, null, 2);
      
      await fs.writeFile(this.storagePath, data, 'utf-8');
    } catch (err) {
      console.error('Failed to save memory to disk:', err);
    }
  }

  async createEntities(entities: Entity[]): Promise<void> {
    const now = new Date().toISOString();
    for (const entity of entities) {
      this.graph.entities.set(entity.name, {
        name: entity.name,
        entityType: entity.entityType,
        observations: entity.observations || [],
        createdAt: entity.createdAt || now,
        updatedAt: entity.updatedAt || now,
        metadata: entity.metadata
      });
    }
    await this.saveToDisk();
  }

  async addObservations(additions: ObservationAddition[]): Promise<void> {
    const now = new Date().toISOString();
    for (const addition of additions) {
      const entity = this.graph.entities.get(addition.entityName);
      if (entity) {
        for (const input of addition.contents) {
          const obs = this.normalizeObservation(input);
          // Deduplicate by content
          if (!entity.observations.some(o => o.content === obs.content)) {
            entity.observations.push(obs);
          }
        }
        entity.updatedAt = now;
      }
    }
    await this.saveToDisk();
  }

  async createRelations(relations: Relation[]): Promise<void> {
    for (const relation of relations) {
      // Check if relation already exists
      const exists = this.graph.relations.some(
        r => r.from === relation.from && 
             r.to === relation.to && 
             r.relationType === relation.relationType
      );
      
      if (!exists) {
        this.graph.relations.push(relation);
      }
    }
    await this.saveToDisk();
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    for (const name of entityNames) {
      this.graph.entities.delete(name);
      // Remove all relations involving this entity
      this.graph.relations = this.graph.relations.filter(
        r => r.from !== name && r.to !== name
      );
    }
    await this.saveToDisk();
  }

  async deleteObservations(deletions: ObservationDeletion[]): Promise<void> {
    const now = new Date().toISOString();
    for (const deletion of deletions) {
      const entity = this.graph.entities.get(deletion.entityName);
      if (entity) {
        entity.observations = entity.observations.filter(
          obs => !deletion.observations.includes(obs.content)
        );
        entity.updatedAt = now;
      }
    }
    await this.saveToDisk();
  }

  async deleteRelations(relations: RelationDeletion[]): Promise<void> {
    for (const deletion of relations) {
      this.graph.relations = this.graph.relations.filter(
        r => !(r.from === deletion.from && 
               r.to === deletion.to && 
               r.relationType === deletion.relationType)
      );
    }
    await this.saveToDisk();
  }

  openNodes(names: string[]): Entity[] {
    const result: Entity[] = [];
    for (const name of names) {
      const entity = this.graph.entities.get(name);
      if (entity) {
        result.push(entity);
      }
    }
    return result;
  }

  readGraph(): KnowledgeGraph {
    return {
      entities: this.graph.entities,
      relations: [...this.graph.relations]
    };
  }

  searchNodes(query: string): Entity[] {
    const lowerQuery = query.toLowerCase();
    const results: Entity[] = [];

    for (const [name, entity] of this.graph.entities) {
      if (name.toLowerCase().includes(lowerQuery) ||
          entity.entityType.toLowerCase().includes(lowerQuery) ||
          entity.observations.some(obs => obs.content.toLowerCase().includes(lowerQuery))) {
        results.push(entity);
      }
    }

    return results;
  }

  getEntity(name: string): Entity | undefined {
    return this.graph.entities.get(name);
  }

  getRelationsForEntity(entityName: string): Relation[] {
    return this.graph.relations.filter(
      r => r.from === entityName || r.to === entityName
    );
  }

  getAllEntityNames(): string[] {
    return Array.from(this.graph.entities.keys());
  }

  getRelationCount(): number {
    return this.graph.relations.length;
  }

  getEntityCount(): number {
    return this.graph.entities.size;
  }

  queryByTime(params: { since?: string; until?: string; limit?: number; sort?: 'asc' | 'desc' }): Entity[] {
    const { since, until, limit, sort = 'desc' } = params;
    let results: Entity[] = [];

    for (const entity of this.graph.entities.values()) {
      const entityTime = new Date(entity.updatedAt).getTime();
      const sinceTime = since ? new Date(since).getTime() : 0;
      const untilTime = until ? new Date(until).getTime() : Infinity;

      if (entityTime >= sinceTime && entityTime <= untilTime) {
        results.push(entity);
      }
    }

    // Sort by updatedAt
    results.sort((a, b) => {
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return sort === 'asc' ? timeA - timeB : timeB - timeA;
    });

    // Apply limit
    if (limit && limit > 0) {
      results = results.slice(0, limit);
    }

    return results;
  }

  getRecent(limit: number = 10): Entity[] {
    return this.queryByTime({ limit, sort: 'desc' });
  }

  traverseGraph(startName: string, depth: number = 1, direction: 'out' | 'in' | 'both' = 'both'): GraphTraversalResult {
    const visited = new Set<string>();
    const entityQueue: string[] = [startName];
    const resultEntities: Entity[] = [];
    const resultRelations: Relation[] = [];
    let currentDepth = 0;

    visited.add(startName);

    while (entityQueue.length > 0 && currentDepth < depth) {
      const levelSize = entityQueue.length;
      
      for (let i = 0; i < levelSize; i++) {
        const currentName = entityQueue.shift()!;
        const entity = this.graph.entities.get(currentName);
        
        if (entity) {
          resultEntities.push(entity);
        }

        // Get relations based on direction
        const relations = this.graph.relations.filter(r => {
          if (direction === 'out') return r.from === currentName;
          if (direction === 'in') return r.to === currentName;
          return r.from === currentName || r.to === currentName;
        });

        for (const relation of relations) {
          resultRelations.push(relation);
          const neighbor = relation.from === currentName ? relation.to : relation.from;
          
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            entityQueue.push(neighbor);
          }
        }
      }
      
      currentDepth++;
    }

    return {
      entities: resultEntities,
      relations: resultRelations,
      depthReached: currentDepth,
      startEntity: startName
    };
  }
}
