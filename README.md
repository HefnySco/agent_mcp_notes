# 🧠 MCP Notes

**MCP Notes** is a powerful memory server that helps AI assistants remember and connect information over time. Think of it as a smart knowledge graph where you can store facts about people, projects, or concepts, link them together, and retrieve them intelligently—perfect for building AI agents with long-term memory.

Whether you're tracking user preferences, maintaining project context, or building relationship maps, MCP Notes provides a structured way to persist, search, and traverse your knowledge graph with confidence scores, timestamps, and rich metadata.

## ✨ Features

- **🏗️ Entity Management** - Create, read, search, and delete entities with types and observations
- **📝 Observation Tracking** - Add and remove observations with timestamps, confidence scores, and sources
- **🔗 Relation Management** - Create and delete relations between entities to build connections
- **🔍 Knowledge Graph Operations** - Read the entire graph, search for specific nodes, or traverse connected entities
- **⏰ Temporal Queries** - Query entities by time range using createdAt/updatedAt timestamps
- **🚶 Graph Traversal** - Walk relations to find connected entities (multi-hop BFS)
- **📊 Rich Metadata** - Support for optional metadata, confidence scores, and source tracking
- **🔄 Auto-Migration** - Automatically migrates legacy plain-string observations to rich format on load
- **💾 Persistent Storage** - JSON file storage with daily logging for reliability

## 🚀 Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd mcp_notes

# Install dependencies
npm install

# Build the TypeScript code
npm run build
```

## 🎯 Quick Start

### Running the Server

```bash
npm start
```

The server runs on stdio and connects to any MCP-compatible client.

### Basic Example

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
      ]
    }
  ]
}
```

Create relations between entities:
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

## 🛠️ Available Tools

### `create_entities`
Create multiple new entities in the knowledge graph.

**Parameters:**
- `entities` (array): Array of entity objects with:
  - `name` (string): The name of the entity
  - `entityType` (string): The type of the entity
  - `observations` (array): Initial observations (can be strings or objects with `content`, `confidence`, `source`)
  - `metadata` (object, optional): Additional metadata for the entity

### `add_observations`
Add new observations to existing entities.

**Parameters:**
- `observations` (array): Array of observation additions with:
  - `entityName` (string): Name of the entity
  - `contents` (array): Observations to add (can be strings or objects with `content`, `confidence`, `source`)

### `create_relations`
Create relations between entities.

**Parameters:**
- `relations` (array): Array of relation objects with:
  - `from` (string): Source entity name
  - `to` (string): Target entity name
  - `relationType` (string): Type of relation (use active voice)

### `delete_entities`
Delete entities and their associated relations.

**Parameters:**
- `entityNames` (array of strings): Names of entities to delete

### `delete_observations`
Delete specific observations from entities.

**Parameters:**
- `deletions` (array): Array of deletion objects with:
  - `entityName` (string): Name of the entity
  - `observations` (array of strings): Observations to delete

### `delete_relations`
Delete relations from the knowledge graph.

**Parameters:**
- `relations` (array): Array of relation objects to delete

### `open_nodes`
Retrieve specific entities by name.

**Parameters:**
- `names` (array of strings): Entity names to retrieve

### `read_graph`
Read the entire knowledge graph including all entities and relations.

### `search_nodes`
Search for entities matching a query.

**Parameters:**
- `query` (string): Search query (matches entity names, types, and observation content)

### `query_by_time`
Query entities and observations by time range using createdAt/updatedAt timestamps.

**Parameters:**
- `since` (string, optional): ISO timestamp for start of time range (inclusive)
- `until` (string, optional): ISO timestamp for end of time range (inclusive)
- `limit` (number, optional): Maximum number of results to return
- `sort` (string, optional): Sort order by updatedAt - "asc" or "desc" (default: "desc")

### `get_recent`
Get the most recently updated entities.

**Parameters:**
- `limit` (number, optional): Maximum number of recent entities to return (default: 10)

### `traverse_graph`
Traverse the knowledge graph from a starting entity to find connected entities via relations.

**Parameters:**
- `start` (string, required): Name of the entity to start traversal from
- `depth` (number, optional): Number of hops to traverse (default: 1)
- `direction` (string, optional): Direction of traversal - "out" (outgoing relations), "in" (incoming relations), or "both" (default: "both")

## 🛠️ Development

```bash
# Build
npm run build

# Watch mode for development
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

## 📊 Data Model

### Observations
Observations are rich objects with metadata:
```typescript
interface Observation {
  content: string;
  createdAt: string; // ISO timestamp
  confidence?: number; // 0-1
  source?: string;
}
```

### Entities
Entities include timestamps and optional metadata:
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

## ⚙️ Configuration

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

## 📁 Architecture

- `src/index.ts` - Main MCP server with tool handlers
- `src/memoryService.ts` - Core memory service managing the knowledge graph
- `src/types.ts` - TypeScript type definitions

## 📄 License

MIT
