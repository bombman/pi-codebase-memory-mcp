import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { spawn } from "node:child_process";

const COMMAND = process.env.CODEBASE_MEMORY_MCP_COMMAND ?? "codebase-memory-mcp";
const TOOL_PREFIX = "cmem_";

type ToolContent = { type: "text"; text: string };
type CliResult = { content?: ToolContent[]; isError?: boolean; [key: string]: unknown };

type ToolSpec = {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  parameters: any;
};

function truncateText(text: string): string {
  const truncation = truncateHead(text, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });

  if (!truncation.truncated) return truncation.content;

  return `${truncation.content}\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Re-run with narrower query/limit for more detail.]`;
}

function normalizeCliResult(stdout: string, stderr: string): CliResult {
  const jsonLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()
    .find((line) => line.startsWith("{"));

  if (!jsonLine) {
    return {
      content: [{ type: "text", text: truncateText(stdout || stderr || "No output") }],
      isError: true,
    };
  }

  try {
    return JSON.parse(jsonLine) as CliResult;
  } catch (error) {
    return {
      content: [{ type: "text", text: truncateText(`${stdout}\n${stderr}`.trim()) }],
      isError: true,
    };
  }
}

function textFromResult(result: CliResult): string {
  const content = result.content ?? [];
  const text = content
    .map((item) => (item.type === "text" ? item.text : JSON.stringify(item)))
    .join("\n");

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function runCli(toolName: string, params: unknown, signal?: AbortSignal): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(COMMAND, ["cli", toolName, JSON.stringify(params ?? {})], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code, sig) => {
      signal?.removeEventListener("abort", abort);
      const result = normalizeCliResult(stdout, stderr);
      if ((code ?? 0) !== 0 && !result.isError) {
        result.isError = true;
        result.content = [{ type: "text", text: truncateText(`${stdout}\n${stderr}`.trim() || `Exited with code ${code}${sig ? ` (${sig})` : ""}`) }];
      }
      resolve(result);
    });
  });
}

const project = Type.String({ description: "Indexed project name. Use cmem_list_projects first if unsure." });
const optionalProject = Type.Optional(project);

const tools: ToolSpec[] = [
  {
    name: "index_repository",
    label: "Codebase Memory: Index Repository",
    description: "Index a repository into codebase-memory-mcp knowledge graph.",
    promptSnippet: "Index a repository into the code knowledge graph",
    parameters: Type.Object({
      repo_path: Type.String({ description: "Path to the repository" }),
      mode: Type.Optional(StringEnum(["full", "moderate", "fast"] as const, { description: "full: all passes. moderate: faster with semantic edges. fast: structure only." })),
    }),
  },
  {
    name: "search_graph",
    label: "Codebase Memory: Search Graph",
    description: "Search the code knowledge graph for functions, classes, routes, variables, definitions, implementations, and relationships.",
    promptSnippet: "Search indexed code definitions and relationships; prefer this over grep for code discovery",
    parameters: Type.Object({
      project,
      query: Type.Optional(Type.String({ description: "Natural-language or keyword full-text search" })),
      label: Type.Optional(Type.String()),
      name_pattern: Type.Optional(Type.String()),
      qn_pattern: Type.Optional(Type.String()),
      file_pattern: Type.Optional(Type.String()),
      relationship: Type.Optional(Type.String()),
      min_degree: Type.Optional(Type.Integer()),
      max_degree: Type.Optional(Type.Integer()),
      exclude_entry_points: Type.Optional(Type.Boolean()),
      include_connected: Type.Optional(Type.Boolean()),
      semantic_query: Type.Optional(Type.Array(Type.String(), { description: "Array of keyword strings, not one string" })),
      limit: Type.Optional(Type.Integer({ description: "Max results" })),
      offset: Type.Optional(Type.Integer()),
    }),
  },
  {
    name: "query_graph",
    label: "Codebase Memory: Query Graph",
    description: "Execute a Cypher query against the knowledge graph for complex multi-hop patterns and aggregations.",
    promptSnippet: "Run Cypher queries against the code knowledge graph",
    parameters: Type.Object({ query: Type.String({ description: "Cypher query" }), project, max_rows: Type.Optional(Type.Integer()) }),
  },
  {
    name: "trace_path",
    label: "Codebase Memory: Trace Path",
    description: "Trace callers/callees, data flow, or cross-service paths through the code graph.",
    promptSnippet: "Trace callers, dependencies, impact, and data flow through indexed code",
    parameters: Type.Object({
      function_name: Type.String(),
      project,
      direction: Type.Optional(StringEnum(["inbound", "outbound", "both"] as const)),
      depth: Type.Optional(Type.Integer()),
      mode: Type.Optional(StringEnum(["calls", "data_flow", "cross_service"] as const)),
      parameter_name: Type.Optional(Type.String()),
      edge_types: Type.Optional(Type.Array(Type.String())),
      risk_labels: Type.Optional(Type.Boolean()),
      include_tests: Type.Optional(Type.Boolean()),
    }),
  },
  {
    name: "get_code_snippet",
    label: "Codebase Memory: Get Code Snippet",
    description: "Read source code for a function/class/symbol. Search first to find the exact qualified_name.",
    promptSnippet: "Read source code by qualified_name from indexed graph",
    parameters: Type.Object({ qualified_name: Type.String(), project, include_neighbors: Type.Optional(Type.Boolean()) }),
  },
  {
    name: "get_graph_schema",
    label: "Codebase Memory: Graph Schema",
    description: "Get node labels and edge types in an indexed project graph.",
    promptSnippet: "Show knowledge graph schema for indexed code",
    parameters: Type.Object({ project }),
  },
  {
    name: "get_architecture",
    label: "Codebase Memory: Architecture",
    description: "Get high-level architecture overview: packages, services, dependencies, and project structure.",
    promptSnippet: "Summarize architecture from indexed code graph",
    parameters: Type.Object({ project, aspects: Type.Optional(Type.Array(Type.String())) }),
  },
  {
    name: "search_code",
    label: "Codebase Memory: Search Code",
    description: "Graph-augmented code text search. Finds text patterns then enriches/deduplicates results with graph context.",
    promptSnippet: "Search text in indexed code with graph-enriched ranking",
    parameters: Type.Object({
      pattern: Type.String(),
      project,
      file_pattern: Type.Optional(Type.String({ description: "Glob for grep --include, e.g. *.go" })),
      path_filter: Type.Optional(Type.String({ description: "Regex filter on result paths" })),
      mode: Type.Optional(StringEnum(["compact", "full", "files"] as const)),
      context: Type.Optional(Type.Integer()),
      regex: Type.Optional(Type.Boolean()),
      limit: Type.Optional(Type.Integer()),
    }),
  },
  {
    name: "list_projects",
    label: "Codebase Memory: List Projects",
    description: "List all indexed codebase-memory-mcp projects.",
    promptSnippet: "List indexed codebase-memory projects",
    parameters: Type.Object({}),
  },
  {
    name: "delete_project",
    label: "Codebase Memory: Delete Project",
    description: "Delete a project from the codebase-memory-mcp index.",
    promptSnippet: "Delete an indexed codebase-memory project",
    parameters: Type.Object({ project }),
  },
  {
    name: "index_status",
    label: "Codebase Memory: Index Status",
    description: "Get indexing status of a project.",
    promptSnippet: "Check codebase-memory indexing status",
    parameters: Type.Object({ project }),
  },
  {
    name: "detect_changes",
    label: "Codebase Memory: Detect Changes",
    description: "Detect code changes and their impact using the indexed graph.",
    promptSnippet: "Detect changed code and impact against indexed graph",
    parameters: Type.Object({ project, scope: Type.Optional(Type.String()), depth: Type.Optional(Type.Integer()), base_branch: Type.Optional(Type.String()), since: Type.Optional(Type.String()) }),
  },
  {
    name: "manage_adr",
    label: "Codebase Memory: Manage ADR",
    description: "Create, get, update, or list Architecture Decision Record sections.",
    promptSnippet: "Manage architecture decision records for an indexed project",
    parameters: Type.Object({ project, mode: Type.Optional(StringEnum(["get", "update", "sections"] as const)), content: Type.Optional(Type.String()), sections: Type.Optional(Type.Array(Type.String())) }),
  },
  {
    name: "ingest_traces",
    label: "Codebase Memory: Ingest Traces",
    description: "Ingest runtime traces to enhance the knowledge graph.",
    promptSnippet: "Ingest runtime traces into codebase-memory graph",
    parameters: Type.Object({ traces: Type.Array(Type.Any()), project }),
  },
];

export default function (pi: ExtensionAPI) {
  for (const spec of tools) {
    pi.registerTool({
      name: `${TOOL_PREFIX}${spec.name}`,
      label: spec.label,
      description: spec.description,
      promptSnippet: spec.promptSnippet,
      promptGuidelines: [
        "Use cmem_list_projects to discover the correct project name before using other cmem_* tools when the project is unknown.",
        "Use cmem_search_graph for code definitions, relationships, callers, implementations, and architecture discovery before falling back to grep.",
      ],
      parameters: spec.parameters,
      async execute(_toolCallId, params, signal, onUpdate) {
        onUpdate?.({ content: [{ type: "text", text: `Running ${COMMAND} cli ${spec.name} ...` }] });
        const result = await runCli(spec.name, params, signal);
        const text = truncateText(textFromResult(result));

        if (result.isError) {
          throw new Error(text || `${spec.name} failed`);
        }

        return {
          content: [{ type: "text", text }],
          details: { tool: spec.name, command: COMMAND, raw: result },
        };
      },
    });
  }

  pi.registerCommand("cmem-projects", {
    description: "List codebase-memory-mcp indexed projects",
    handler: async (_args, ctx) => {
      const result = await runCli("list_projects", {}, ctx.signal);
      const text = truncateText(textFromResult(result));
      if (ctx.hasUI) ctx.ui.notify(text, result.isError ? "error" : "info");
      else console.log(text);
    },
  });
}
