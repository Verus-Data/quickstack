export const README_RESOURCE_URI = "mcp://readme";

export const README_RESOURCE_NAME = "readme";

export const README_RESOURCE_DESCRIPTION =
  "The package README, served as a static markdown resource.";

export const README_RESOURCE_MIME_TYPE = "text/markdown";

export const README_RESOURCE_BODY = `# @quickstacks/mcp

A stdio MCP server built on Effect's MCP modules. It exposes typed tools and a
static resource over newline-delimited JSON-RPC, launched by an agent client
as a subprocess.

## Tools

- **ping** — takes no parameters and returns \`{ alive: true }\`.
- **echo** — takes \`{ text: string }\` and returns \`{ text, length }\`. Inputs
  longer than ${10000} characters fail with \`EchoTooLong\`.

## Resource

- \`mcp://readme\` — this document, served as \`text/markdown\`.

## Running

\`\`\`
node dist/server.js
\`\`\`

The server reads no flags and no config file. Its entire input is JSON-RPC over
stdin; stdout is protocol-only. Set \`MCP_LOG_LEVEL\` (trace, debug, info, warn,
error, fatal) to adjust the log threshold; logs go to stderr. An unset or
unrecognized value defaults to info.
`;
