# MCP Notes

A Model Context Protocol (MCP) server for persistent knowledge graph notes. This server allows you to store and retrieve entities, observations, and relations in a structured knowledge graph with temporal queries, graph traversal, and rich metadata.

## Features

- **Entity Management**: Create, read, search, and delete entities with types and observations
- **Observation Tracking**: Add and remove observations from existing entities with timestamps, confidence scores, and sources
- **Relation Management**: Create and delete relations between entities
- **Knowledge Graph Operations**: Read the entire graph, search for specific nodes, or traverse connected entities
- **Temporal Queries**: Query entities by time range (createdAt/updatedAt timestamps)
- **Graph Traversal**: Walk relations to find connected entities (multi-hop BFS)
- **Rich Metadata**: Entities and observations support optional metadata, confidence, and source tracking
- **Auto-Migration**: Automatically migrates legacy plain-string observations to rich format on load
- **Persistent Storage**: JSON file storage with daily logging

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the TypeScript code:
```bash
npm run build
```

## Usage

### Running the Server

Start the server with:
```bash
npm start
```

The server runs on stdio and can be connected to by any MCP-compatible client.

### Available Tools

#### `create_entities`
Create multiple new entities in the knowledge graph.

**Parameters:**
- `entities` (array): Array of entity objects with:
  - `name` (string): The name of the entity
  - `entityType` (string): The type of the entity
  - `observations` (array): Initial observations (can be strings or objects with `content`, `confidence`, `source`)
  - `metadata` (object, optional): Additional metadata for the entity

**Example:**
```json
{
  "entities": [
    {
      "name": "Alice",
      "entityType": "person",
      "observations": [
        "Alice is a software engineer",
        {
          "content": "Alice lives in San Francisco",
          "confidence": 0.9,
          "source": "user_profile"
        }
      ],
      "metadata": {
        "department": "engineering"
      }
    }
  ]
}
```

#### `add_observations`
Add new observations to existing entities.

**Parameters:**
- `observations` (array): Array of observation additions with:
  - `entityName` (string): Name of the entity
  - `contents` (array): Observations to add (can be strings or objects with `content`, `confidence`, `source`)

#### `create_relations`
Create relations between entities.

**Parameters:**
- `relations` (array): Array of relation objects with:
  - `from` (string): Source entity name
  - `to` (string): Target entity name
  - `relationType` (string): Type of relation (use active voice)

**Example:**
```json
{
  "relations": [
    {
      "from": "Alice",
      "to": "Bob",
      "relationType": "works with"
    }
  ]
}
```

#### `delete_entities`
Delete entities and their associated relations.

**Parameters:**
- `entityNames` (array of strings): Names of entities to delete

#### `delete_observations`
Delete specific observations from entities.

**Parameters:**
- `deletions` (array): Array of deletion objects with:
  - `entityName` (string): Name of the entity
  - `observations` (array of strings): Observations to delete

#### `delete_relations`
Delete relations from the knowledge graph.

**Parameters:**
- `relations` (array): Array of relation objects to delete

#### `open_nodes`
Retrieve specific entities by name.

**Parameters:**
- `names` (array of strings): Entity names to retrieve

#### `read_graph`
Read the entire knowledge graph including all entities and relations.

#### `search_nodes`
Search for entities matching a query.

**Parameters:**
- `query` (string): Search query (matches entity names, types, and observation content)

#### `query_by_time`
Query entities and observations by time range using createdAt/updatedAt timestamps.

**Parameters:**
- `since` (string, optional): ISO timestamp for start of time range (inclusive)
- `until` (string, optional): ISO timestamp for end of time range (inclusive)
- `limit` (number, optional): Maximum number of results to return
- `sort` (string, optional): Sort order by updatedAt - "asc" or "desc" (default: "desc")

**Example:**
```json
{
  "since": "2026-01-01T00:00:00Z",
  "until": "2026-12-31T23:59:59Z",
  "limit": 20,
  "sort": "desc"
}
```

#### `get_recent`
Get the most recently updated entities.

**Parameters:**
- `limit` (number, optional): Maximum number of recent entities to return (default: 10)

**Example:**
```json
{
  "limit": 5
}
```

#### `traverse_graph`
Traverse the knowledge graph from a starting entity to find connected entities via relations.

**Parameters:**
- `start` (string, required): Name of the entity to start traversal from
- `depth` (number, optional): Number of hops to traverse (default: 1)
- `direction` (string, optional): Direction of traversal - "out" (outgoing relations), "in" (incoming relations), or "both" (default: "both")

**Example:**
```json
{
  "start": "Alice",
  "depth": 2,
  "direction": "both"
}
```

## Development

### Build
```bash
npm run build
```

### Watch Mode
```bash
npm run dev
```

### Type Definitions
TypeScript types are defined in `src/types.ts` for:
- Entity (with createdAt, updatedAt, metadata)
- Observation (with content, createdAt, confidence, source)
- Relation
- ObservationAddition
- ObservationDeletion
- RelationDeletion
- KnowledgeGraph
- GraphTraversalResult

## Data Model Changes (v1.1.0)

### Observations
Observations are now objects instead of plain strings:
```typescript
interface Observation {
  content: string;
  createdAt: string; // ISO timestamp
  confidence?: number; // 0-1
  source?: string;
}
```

### Entities
Entities now include timestamps and optional metadata:
```typescript
interface Entity {
  name: string;
  entityType: string;
  observations: Observation[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  metadata?: Record<string, unknown>;
}
```

### Auto-Migration
Legacy data with plain-string observations is automatically migrated on load. Plain strings are converted to Observation objects with `createdAt` set to the current time.

## MCP Configuration

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/mcp_notes/dist/index.js"]
    }
  }
}
```

## Architecture

- `src/index.ts`: Main MCP server with tool handlers
- `src/memoryService.ts`: Core memory service managing the knowledge graph
- `src/types.ts`: TypeScript type definitions

## License

MIT
