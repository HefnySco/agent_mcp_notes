#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryService } from './memoryService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Project root is one level up from dist/ (where the compiled file lives)
const PROJECT_ROOT = path.resolve(__dirname, '..');

class MemoryMCPServer {
  private server: Server;
  private memoryService: MemoryService;
  private outputDir: string;

  constructor() {
    this.outputDir = process.env.MEMORY_OUTPUT_DIR || path.join(PROJECT_ROOT, 'output');
    const storagePath = process.env.MEMORY_STORAGE_PATH || path.join(PROJECT_ROOT, 'memory-storage.json');
    this.ensureOutputDir();
    this.server = new Server(
      {
        name: 'memory_custom',
        version: '1.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.memoryService = new MemoryService(storagePath);
    this.setupHandlers();
  }

  private async ensureOutputDir() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (err) {
      console.error('Failed to create output directory:', err);
    }
  }

  private async logRequest(toolName: string, args: any, result: any) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        tool: toolName,
        arguments: args,
        result: result
      };

      const dateStr = timestamp.split('T')[0];
      const logFile = path.join(this.outputDir, `memory-log-${dateStr}.json`);

      // Ensure the output directory exists (guards against first-call race)
      await fs.mkdir(this.outputDir, { recursive: true });

      let logs: any[] = [];
      try {
        const existing = await fs.readFile(logFile, 'utf-8');
        logs = JSON.parse(existing);
      } catch (err) {
        // File doesn't exist or is empty, start fresh
      }

      logs.push(logEntry);
      await fs.writeFile(logFile, JSON.stringify(logs, null, 2));
    } catch (err) {
      console.error('Failed to log request:', err);
    }
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_entities',
            description: 'Create multiple new entities in the knowledge graph',
            inputSchema: {
              type: 'object',
              properties: {
                entities: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: 'The name of the entity'
                      },
                      entityType: {
                        type: 'string',
                        description: 'The type of the entity'
                      },
                      observations: {
                        type: 'array',
                        items: {
                          oneOf: [
                            { type: 'string' },
                            {
                              type: 'object',
                              properties: {
                                content: { type: 'string' },
                                confidence: { type: 'number' },
                                source: { type: 'string' }
                              }
                            }
                          ]
                        },
                        description: 'An array of observation contents (strings or objects with content, confidence, source)'
                      }
                    },
                    required: ['name', 'entityType', 'observations']
                  }
                }
              },
              required: ['entities']
            }
          },
          {
            name: 'add_observations',
            description: 'Add new observations to existing entities in the knowledge graph',
            inputSchema: {
              type: 'object',
              properties: {
                observations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      entityName: {
                        type: 'string',
                        description: 'The name of the entity to add the observations to'
                      },
                      contents: {
                        type: 'array',
                        items: {
                          oneOf: [
                            { type: 'string' },
                            {
                              type: 'object',
                              properties: {
                                content: { type: 'string' },
                                confidence: { type: 'number' },
                                source: { type: 'string' }
                              }
                            }
                          ]
                        },
                        description: 'An array of observation contents (strings or objects with content, confidence, source)'
                      }
                    },
                    required: ['entityName', 'contents']
                  }
                }
              },
              required: ['observations']
            }
          },
          {
            name: 'create_relations',
            description: 'Create multiple new relations between entities in the knowledge graph. Relations should be in active voice',
            inputSchema: {
              type: 'object',
              properties: {
                relations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      from: {
                        type: 'string',
                        description: 'The name of the entity where the relation starts'
                      },
                      to: {
                        type: 'string',
                        description: 'The name of the entity where the relation ends'
                      },
                      relationType: {
                        type: 'string',
                        description: 'The type of the relation'
                      }
                    },
                    required: ['from', 'to', 'relationType']
                  }
                }
              },
              required: ['relations']
            }
          },
          {
            name: 'delete_entities',
            description: 'Delete multiple entities and their associated relations from the knowledge graph',
            inputSchema: {
              type: 'object',
              properties: {
                entityNames: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'An array of entity names to delete'
                }
              },
              required: ['entityNames']
            }
          },
          {
            name: 'delete_observations',
            description: 'Delete specific observations from entities in the knowledge graph',
            inputSchema: {
              type: 'object',
              properties: {
                deletions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      entityName: {
                        type: 'string',
                        description: 'The name of the entity containing the observations'
                      },
                      observations: {
                        type: 'array',
                        items: {
                          type: 'string'
                        },
                        description: 'An array of observations to delete'
                      }
                    },
                    required: ['entityName', 'observations']
                  }
                }
              },
              required: ['deletions']
            }
          },
          {
            name: 'delete_relations',
            description: 'Delete multiple relations from the knowledge graph',
            inputSchema: {
              type: 'object',
              properties: {
                relations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      from: {
                        type: 'string',
                        description: 'The name of the entity where the relation starts'
                      },
                      to: {
                        type: 'string',
                        description: 'The name of the entity where the relation ends'
                      },
                      relationType: {
                        type: 'string',
                        description: 'The type of the relation'
                      }
                    },
                    required: ['from', 'to', 'relationType']
                  }
                }
              },
              required: ['relations']
            }
          },
          {
            name: 'open_nodes',
            description: 'Open specific nodes in the knowledge graph by their names',
            inputSchema: {
              type: 'object',
              properties: {
                names: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'An array of entity names to retrieve'
                }
              },
              required: ['names']
            }
          },
          {
            name: 'read_graph',
            description: 'Read the entire knowledge graph',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'search_nodes',
            description: 'Search for nodes in the knowledge graph based on a query',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query to match against entity names, types, and observation content'
                }
              },
              required: ['query']
            }
          },
          {
            name: 'get_version',
            description: 'Get the version information of this memory MCP server',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'query_by_time',
            description: 'Query entities and observations by time range using createdAt/updatedAt timestamps',
            inputSchema: {
              type: 'object',
              properties: {
                since: {
                  type: 'string',
                  description: 'ISO timestamp for start of time range (inclusive)'
                },
                until: {
                  type: 'string',
                  description: 'ISO timestamp for end of time range (inclusive)'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return'
                },
                sort: {
                  type: 'string',
                  enum: ['asc', 'desc'],
                  description: 'Sort order by updatedAt (default: desc)'
                }
              }
            }
          },
          {
            name: 'get_recent',
            description: 'Get the most recently updated entities',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  default: 10,
                  description: 'Maximum number of recent entities to return'
                }
              }
            }
          },
          {
            name: 'traverse_graph',
            description: 'Traverse the knowledge graph from a starting entity to find connected entities via relations',
            inputSchema: {
              type: 'object',
              properties: {
                start: {
                  type: 'string',
                  description: 'Name of the entity to start traversal from'
                },
                depth: {
                  type: 'number',
                  default: 1,
                  description: 'Number of hops to traverse (default: 1)'
                },
                direction: {
                  type: 'string',
                  enum: ['out', 'in', 'both'],
                  default: 'both',
                  description: 'Direction of traversal: out (outgoing relations), in (incoming relations), or both (default: both)'
                }
              },
              required: ['start']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      await this.logRequest(name, args, { status: 'started' });

      try {
        switch (name) {
          case 'create_entities': {
            const entities = args?.entities as any[];
            if (!entities || !Array.isArray(entities)) {
              throw new Error('entities array is required');
            }

            await this.memoryService.createEntities(entities);

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    message: `Created ${entities.length} entities`,
                    entities: entities.map(e => e.name)
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'add_observations': {
            const observations = args?.observations as any[];
            if (!observations || !Array.isArray(observations)) {
              throw new Error('observations array is required');
            }

            await this.memoryService.addObservations(observations);

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    message: `Added observations to ${observations.length} entities`,
                    entities: observations.map(o => o.entityName)
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'create_relations': {
            const relations = args?.relations as any[];
            if (!relations || !Array.isArray(relations)) {
              throw new Error('relations array is required');
            }

            await this.memoryService.createRelations(relations);

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    message: `Created ${relations.length} relations`,
                    relations
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'delete_entities': {
            const entityNames = args?.entityNames as string[];
            if (!entityNames || !Array.isArray(entityNames)) {
              throw new Error('entityNames array is required');
            }

            await this.memoryService.deleteEntities(entityNames);

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    message: `Deleted ${entityNames.length} entities`,
                    entities: entityNames
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'delete_observations': {
            const deletions = args?.deletions as any[];
            if (!deletions || !Array.isArray(deletions)) {
              throw new Error('deletions array is required');
            }

            await this.memoryService.deleteObservations(deletions);

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    message: `Deleted observations from ${deletions.length} entities`,
                    entities: deletions.map(d => d.entityName)
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'delete_relations': {
            const relations = args?.relations as any[];
            if (!relations || !Array.isArray(relations)) {
              throw new Error('relations array is required');
            }

            await this.memoryService.deleteRelations(relations);

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    message: `Deleted ${relations.length} relations`,
                    relations
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'open_nodes': {
            const names = args?.names as string[];
            if (!names || !Array.isArray(names)) {
              throw new Error('names array is required');
            }

            const entities = this.memoryService.openNodes(names);

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    entities,
                    count: entities.length
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'read_graph': {
            const graph = this.memoryService.readGraph();
            
            // Convert Map to array for JSON serialization
            const entitiesArray = Array.from(graph.entities.entries()).map(([name, entity]) => ({
              name,
              entityType: entity.entityType,
              observations: entity.observations,
              createdAt: entity.createdAt,
              updatedAt: entity.updatedAt,
              metadata: entity.metadata
            }));

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    entities: entitiesArray,
                    relations: graph.relations,
                    stats: {
                      entityCount: entitiesArray.length,
                      relationCount: graph.relations.length
                    }
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'search_nodes': {
            const query = args?.query as string;
            if (!query) {
              throw new Error('query is required');
            }

            const entities = this.memoryService.searchNodes(query);

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    query,
                    results: entities,
                    count: entities.length
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'get_version': {
            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    name: 'memory_custom',
                    version: '1.1.0',
                    description: 'Persistent knowledge graph memory MCP server with JSON file storage, temporal queries, and graph traversal',
                    features: ['entities', 'observations', 'relations', 'persistent_storage', 'temporal_queries', 'graph_traversal', 'rich_metadata']
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'query_by_time': {
            const since = args?.since as string | undefined;
            const until = args?.until as string | undefined;
            const limit = args?.limit as number | undefined;
            const sort = args?.sort as 'asc' | 'desc' | undefined;

            const entities = this.memoryService.queryByTime({ since, until, limit, sort });

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    query: { since, until, limit, sort },
                    results: entities,
                    count: entities.length
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'get_recent': {
            const limit = args?.limit as number || 10;

            const entities = this.memoryService.getRecent(limit);

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    limit,
                    results: entities,
                    count: entities.length
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          case 'traverse_graph': {
            const start = args?.start as string;
            const depth = args?.depth as number || 1;
            const direction = args?.direction as 'out' | 'in' | 'both' || 'both';

            if (!start) {
              throw new Error('start parameter is required');
            }

            const traversal = this.memoryService.traverseGraph(start, depth, direction);

            const result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    start,
                    depth,
                    direction,
                    ...traversal
                  }, null, 2)
                }
              ]
            };
            await this.logRequest(name, args, result);
            return result;
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error'
              }, null, 2)
            }
          ]
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Memory MCP server running on stdio');
  }
}

const server = new MemoryMCPServer();
server.run().catch(console.error);
