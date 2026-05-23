# pi-codebase-memory-mcp

A [pi](https://github.com/earendil-works/pi-mono) package that exposes [`codebase-memory-mcp`](https://github.com/DeusData/codebase-memory-mcp) as native pi tools.

This package is useful when you want pi to query a code knowledge graph for architecture discovery, symbol search, call tracing, graph queries, and code snippets.

## Features

- Registers `codebase-memory-mcp` tools in pi with the `cmem_` prefix.
- Works with the existing `codebase-memory-mcp cli <tool> <json>` interface.
- No MCP client support is required in pi.
- Can be installed globally, per project, from a local checkout, npm, or GitHub.
- **Progress streaming** — Live pipeline progress shown in pi UI during long operations like `cmem_index_repository`.

## Requirements

Install `codebase-memory-mcp` first and make sure the binary is available:

```bash
codebase-memory-mcp --help
```

If your binary has a different path or name, set:

```bash
export CODEBASE_MEMORY_MCP_COMMAND=/path/to/codebase-memory-mcp
```

## Installation

### From a local checkout

```bash
git clone https://github.com/bombman/pi-codebase-memory-mcp.git
cd pi-codebase-memory-mcp
pi install .
```

### Project-local install

Use this when you want only the current repository to load the package:

```bash
pi install -l .
```

### From GitHub

After publishing the repository:

```bash
pi install https://github.com/bombman/pi-codebase-memory-mcp
```

Or pin a tag/commit:

```bash
pi install https://github.com/bombman/pi-codebase-memory-mcp@v0.1.0
```

## Usage

Restart pi or run:

```text
/reload
```

Then ask pi in natural language, for example:

```text
Use codebase memory to list indexed projects.
```

```text
Use codebase memory to search for authentication-related functions in project my-project.
```

```text
Use codebase memory to show the architecture overview of project my-project.
```

```text
Use codebase memory to trace callers of function handleLogin in project my-project.
```

There is also one slash command you can run directly:

```text
/cmem-projects
```

## Available tools

All tools are registered with the `cmem_` prefix:

| Tool | Purpose |
| --- | --- |
| `cmem_index_repository` | Index a repository into the knowledge graph, including additional extensions such as `.astro` via `file_extensions`. |
| `cmem_search_graph` | Search indexed code definitions and relationships. |
| `cmem_query_graph` | Run Cypher queries against the code knowledge graph. |
| `cmem_trace_path` | Trace callers, callees, dependencies, impact, and data flow. |
| `cmem_get_code_snippet` | Read source code for a symbol by qualified name. |
| `cmem_get_graph_schema` | Show node labels and edge types. |
| `cmem_get_architecture` | Summarize high-level architecture. |
| `cmem_search_code` | Search code text with graph-enriched ranking. |
| `cmem_list_projects` | List indexed projects. |
| `cmem_delete_project` | Delete an indexed project. |
| `cmem_index_status` | Check indexing status. |
| `cmem_detect_changes` | Detect changed code and graph impact. |
| `cmem_manage_adr` | Manage architecture decision records. |
| `cmem_ingest_traces` | Ingest runtime traces. |

## Recommended workflow

1. Ask pi to call `cmem_list_projects` or run `/cmem-projects`.
2. Use the returned project name in later questions.
3. Use `cmem_search_graph` for discovery before falling back to grep.
4. Use `cmem_get_code_snippet` only after finding the exact `qualified_name`.

Example:

```text
Use cmem_list_projects, then search the correct project for functions related to payment retry logic.
```

## Graph UI

The graph UI is provided by `codebase-memory-mcp`, not this pi package.

To start it manually:

```bash
nohup sh -c 'tail -f /dev/null | codebase-memory-mcp --ui=true --port=9749' >/tmp/cmem-ui.log 2>&1 &
```

Then open:

```text
http://127.0.0.1:9749/
```

## How it works

pi does not include built-in MCP client support. This package bridges to `codebase-memory-mcp` by executing:

```bash
codebase-memory-mcp cli <tool> '<json-args>'
```

The result is normalized and returned to pi as a native tool result.

## Custom file extensions

To index file types not natively supported (e.g. `.astro`, `.blade.php`), create a **JSON config file** at the project root before running `cmem_index_repository`:

```json
// .codebase-memory.json (at repository root)
{"extra_extensions": {".astro": "html"}}
```

Then delete the old index and re-index:

```
cmem_delete_project(project="project-name")
cmem_index_repository(repo_path="/path/to/repo")
```

> **Note:** The extended extension must map to a language the parser already supports (see binary `--help` for language list).
> Common mappings: `.astro` → `html`, `.blade.php` → `php`, `.mjml` → `html`.

There is also a **global** config file at `~/.config/codebase-memory-mcp/config.json` with the same format — project config wins over global.

The `cmem_index_repository` tool does **not** accept a `file_extensions` parameter; configure extension mappings only through the JSON config file above.

## Development

This package is a pi package. The important files are:

```text
package.json
extensions/codebase-memory.ts
README.md
```

Test from this checkout:

```bash
pi --no-extensions -e . --no-session -p /cmem-projects
```

List installed pi packages:

```bash
pi list
```

## License

MIT
