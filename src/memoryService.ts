import { Entity, Relation, KnowledgeGraph, ObservationAddition, ObservationDeletion, RelationDeletion, Observation, GraphTraversalResult } from './types.js';
import fs from 'fs/promises';
import path from 'path';
import levenshtein from 'fast-levenshtein';
import { pipeline, env } from '@xenova/transformers';

// Skip local model checks for transformers.js
env.allowLocalModels = false;

export class MemoryService {
  private graph: KnowledgeGraph;
  private storagePath: string;
  private embeddingModel: any = null;

  constructor(storagePath: string = '/tmp/mcp-memory-storage.json') {
    this.storagePath = storagePath;
    this.graph = {
      entities: new Map<string, Entity>(),
      relations: []
    };
    this.loadFromDisk();
  }

  private async getEmbeddingModel() {
    if (!this.embeddingModel) {
      // Load a lightweight sentence embedding model
      this.embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return this.embeddingModel;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const model = await this.getEmbeddingModel();
      const output = await model(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      return [];
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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

  async addObservations(additions: ObservationAddition[], generateEmbeddings: boolean = false): Promise<void> {
    const now = new Date().toISOString();
    for (const addition of additions) {
      const entity = this.graph.entities.get(addition.entityName);
      if (entity) {
        for (const input of addition.contents) {
          const obs = this.normalizeObservation(input);
          // Deduplicate by content
          if (!entity.observations.some(o => o.content === obs.content)) {
            // Generate embedding if requested
            if (generateEmbeddings) {
              obs.embedding = await this.generateEmbedding(obs.content);
            }
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

  fuzzySearch(query: string, threshold: number = 0.7): Entity[] {
    const results: Entity[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [name, entity] of this.graph.entities) {
      let bestScore = 0;
      let matchField = '';

      // Check name similarity
      const nameDistance = levenshtein.get(name.toLowerCase(), lowerQuery);
      const nameSimilarity = 1 - (nameDistance / Math.max(name.length, query.length));
      if (nameSimilarity > bestScore) {
        bestScore = nameSimilarity;
        matchField = 'name';
      }

      // Check entity type similarity
      const typeDistance = levenshtein.get(entity.entityType.toLowerCase(), lowerQuery);
      const typeSimilarity = 1 - (typeDistance / Math.max(entity.entityType.length, query.length));
      if (typeSimilarity > bestScore) {
        bestScore = typeSimilarity;
        matchField = 'type';
      }

      // Check observation content similarity
      for (const obs of entity.observations) {
        const obsDistance = levenshtein.get(obs.content.toLowerCase(), lowerQuery);
        const obsSimilarity = 1 - (obsDistance / Math.max(obs.content.length, query.length));
        if (obsSimilarity > bestScore) {
          bestScore = obsSimilarity;
          matchField = 'observation';
        }
      }

      if (bestScore >= threshold) {
        results.push({
          ...entity,
          metadata: {
            ...entity.metadata,
            fuzzyMatchScore: bestScore,
            fuzzyMatchField: matchField
          }
        });
      }
    }

    // Sort by similarity score descending
    results.sort((a, b) => {
      const scoreA = (a.metadata as any)?.fuzzyMatchScore || 0;
      const scoreB = (b.metadata as any)?.fuzzyMatchScore || 0;
      return scoreB - scoreA;
    });

    return results;
  }

  async semanticSearch(query: string, threshold: number = 0.5, limit: number = 10): Promise<Entity[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    if (queryEmbedding.length === 0) {
      return [];
    }

    const results: Array<{ entity: Entity; score: number }> = [];

    for (const [name, entity] of this.graph.entities) {
      let bestScore = 0;
      let bestObservation = '';

      // Check entity name
      const nameEmbedding = await this.generateEmbedding(name);
      const nameScore = this.cosineSimilarity(queryEmbedding, nameEmbedding);
      if (nameScore > bestScore) {
        bestScore = nameScore;
        bestObservation = name;
      }

      // Check entity type
      const typeEmbedding = await this.generateEmbedding(entity.entityType);
      const typeScore = this.cosineSimilarity(queryEmbedding, typeEmbedding);
      if (typeScore > bestScore) {
        bestScore = typeScore;
        bestObservation = entity.entityType;
      }

      // Check observations with embeddings
      for (const obs of entity.observations) {
        if (obs.embedding && obs.embedding.length > 0) {
          const obsScore = this.cosineSimilarity(queryEmbedding, obs.embedding);
          if (obsScore > bestScore) {
            bestScore = obsScore;
            bestObservation = obs.content;
          }
        }
      }

      if (bestScore >= threshold) {
        results.push({
          entity: {
            ...entity,
            metadata: {
              ...entity.metadata,
              semanticMatchScore: bestScore,
              semanticMatchContent: bestObservation
            }
          },
          score: bestScore
        });
      }
    }

    // Sort by similarity score descending and apply limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map(r => r.entity);
  }

  // Graph Analytics Methods
  degreeCentrality(): Map<string, number> {
    const centrality = new Map<string, number>();
    const maxDegree = this.graph.relations.length * 2; // Upper bound

    for (const [name] of this.graph.entities) {
      const degree = this.graph.relations.filter(
        r => r.from === name || r.to === name
      ).length;
      centrality.set(name, maxDegree > 0 ? degree / maxDegree : 0);
    }

    return centrality;
  }

  betweennessCentrality(): Map<string, number> {
    const centrality = new Map<string, number>();
    const entityNames = Array.from(this.graph.entities.keys());

    // Initialize all to 0
    for (const name of entityNames) {
      centrality.set(name, 0);
    }

    // For each pair of nodes, find shortest paths and count betweenness
    for (let i = 0; i < entityNames.length; i++) {
      for (let j = i + 1; j < entityNames.length; j++) {
        const source = entityNames[i];
        const target = entityNames[j];
        const paths = this.findAllShortestPaths(source, target);

        for (const path of paths) {
          // Count intermediate nodes
          for (let k = 1; k < path.length - 1; k++) {
            const intermediate = path[k];
            const current = centrality.get(intermediate) || 0;
            centrality.set(intermediate, current + 1 / paths.length);
          }
        }
      }
    }

    // Normalize
    const maxBetweenness = Math.max(...Array.from(centrality.values()));
    if (maxBetweenness > 0) {
      for (const [name, value] of centrality) {
        centrality.set(name, value / maxBetweenness);
      }
    }

    return centrality;
  }

  closenessCentrality(): Map<string, number> {
    const centrality = new Map<string, number>();
    const entityNames = Array.from(this.graph.entities.keys());

    for (const source of entityNames) {
      let totalDistance = 0;
      let reachableCount = 0;

      for (const target of entityNames) {
        if (source === target) continue;

        const distance = this.shortestPathLength(source, target);
        if (distance !== Infinity) {
          totalDistance += distance;
          reachableCount++;
        }
      }

      if (reachableCount > 0) {
        const closeness = (reachableCount - 1) / totalDistance;
        centrality.set(source, closeness);
      } else {
        centrality.set(source, 0);
      }
    }

    return centrality;
  }

  private findAllShortestPaths(source: string, target: string): string[][] {
    const paths: string[][] = [];
    const queue: { node: string; path: string[] }[] = [{ node: source, path: [source] }];
    const visited = new Set<string>();
    let shortestLength = Infinity;

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;

      if (node === target) {
        if (path.length < shortestLength) {
          shortestLength = path.length;
          paths.length = 0; // Clear previous longer paths
          paths.push(path);
        } else if (path.length === shortestLength) {
          paths.push(path);
        }
        continue;
      }

      if (path.length >= shortestLength) continue;

      visited.add(node);

      const neighbors = this.getNeighbors(node);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ node: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return paths;
  }

  private shortestPathLength(source: string, target: string): number {
    if (source === target) return 0;

    const queue: { node: string; distance: number }[] = [{ node: source, distance: 0 }];
    const visited = new Set<string>([source]);

    while (queue.length > 0) {
      const { node, distance } = queue.shift()!;

      if (node === target) return distance;

      const neighbors = this.getNeighbors(node);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, distance: distance + 1 });
        }
      }
    }

    return Infinity;
  }

  private getNeighbors(node: string): string[] {
    const neighbors = new Set<string>();
    for (const relation of this.graph.relations) {
      if (relation.from === node) neighbors.add(relation.to);
      if (relation.to === node) neighbors.add(relation.from);
    }
    return Array.from(neighbors);
  }

  shortestPath(source: string, target: string): string[] | null {
    if (source === target) return [source];

    const queue: { node: string; path: string[] }[] = [{ node: source, path: [source] }];
    const visited = new Set<string>([source]);

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;

      if (node === target) return path;

      const neighbors = this.getNeighbors(node);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return null; // No path found
  }

  dijkstraShortestPath(source: string, target: string, weights?: Map<string, number>): string[] | null {
    if (source === target) return [source];

    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const unvisited = new Set<string>(this.graph.entities.keys());

    for (const name of this.graph.entities.keys()) {
      distances.set(name, Infinity);
      previous.set(name, null);
    }
    distances.set(source, 0);

    while (unvisited.size > 0) {
      // Find unvisited node with smallest distance
      let current: string | null = null;
      let minDistance = Infinity;

      for (const node of unvisited) {
        const dist = distances.get(node) || Infinity;
        if (dist < minDistance) {
          minDistance = dist;
          current = node;
        }
      }

      if (current === null || minDistance === Infinity) break;
      if (current === target) break;

      unvisited.delete(current);

      const neighbors = this.getNeighbors(current);
      for (const neighbor of neighbors) {
        if (!unvisited.has(neighbor)) continue;

        // Get edge weight (default to 1 if not provided)
        const edgeKey = `${current}-${neighbor}`;
        const edgeWeight = weights?.get(edgeKey) || 1;

        const alt = (distances.get(current) || 0) + edgeWeight;
        if (alt < (distances.get(neighbor) || Infinity)) {
          distances.set(neighbor, alt);
          previous.set(neighbor, current);
        }
      }
    }

    // Reconstruct path
    const path: string[] = [];
    let current: string | null = target;

    if (previous.get(current) === null && current !== source) {
      return null; // No path found
    }

    while (current !== null) {
      path.unshift(current);
      current = previous.get(current) || null;
    }

    return path.length > 0 ? path : null;
  }

  labelPropagationCommunities(maxIterations: number = 100): Map<string, string[]> {
    const communities = new Map<string, Set<string>>();
    const labels = new Map<string, string>();

    // Initialize each node with its own label
    for (const name of this.graph.entities.keys()) {
      labels.set(name, name);
      communities.set(name, new Set([name]));
    }

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let changed = false;
      const nodes = Array.from(this.graph.entities.keys());

      // Process nodes in random order
      for (const node of nodes) {
        const neighbors = this.getNeighbors(node);
        if (neighbors.length === 0) continue;

        // Count label frequencies among neighbors
        const labelCounts = new Map<string, number>();
        for (const neighbor of neighbors) {
          const label = labels.get(neighbor) || neighbor;
          labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
        }

        // Find most frequent label
        let maxCount = 0;
        let newLabel = labels.get(node) || node;

        for (const [label, count] of labelCounts) {
          if (count > maxCount || (count === maxCount && Math.random() > 0.5)) {
            maxCount = count;
            newLabel = label;
          }
        }

        if (newLabel !== labels.get(node)) {
          labels.set(node, newLabel);
          changed = true;
        }
      }

      if (!changed) break; // Convergence
    }

    // Group nodes by their final labels
    const result = new Map<string, string[]>();
    for (const [node, label] of labels) {
      if (!result.has(label)) {
        result.set(label, []);
      }
      result.get(label)!.push(node);
    }

    return result;
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
