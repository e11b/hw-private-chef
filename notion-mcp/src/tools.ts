/**
 * Notion MCP tool registrations.
 * Portable module: works with both stdio (local) and HTTP (CF Worker) transports.
 * All 13 tools use @notionhq/client v5 SDK methods directly.
 *
 * NOTE: index.js (local stdio) has a parallel copy of these tools in plain JS.
 * When updating tools, update BOTH files. This is intentional tech debt:
 * index.js runs without a build step, tools.ts requires TS compilation via wrangler.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@notionhq/client";
import { z } from "zod";

function handleError(error: any) {
  const msg = error?.message || String(error);
  console.error("Notion API error:", error?.code, msg);

  const errorMap: Record<string, string> = {
    unauthorized: "Authentication failed. The Notion integration token may be invalid or revoked. Check the integration at notion.so/profile/integrations.",
    object_not_found: "Not found. The page or database may not be shared with the integration. In Notion, open the item, click the three-dot menu, and connect the integration.",
    validation_error: `Validation error: ${msg}`,
    rate_limited: "Rate limited by Notion. Wait a moment and try again.",
  };

  return {
    content: [{ type: "text" as const, text: errorMap[error?.code] || `Notion API error: ${msg}` }],
    isError: true,
  };
}

function json(data: any) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function paginatedJson(response: any) {
  return json({
    results: response.results,
    result_count: response.results.length,
    has_more: response.has_more,
    next_cursor: response.next_cursor,
  });
}

export function registerTools(server: McpServer, notionToken: string) {
  const notion = new Client({ auth: notionToken });

  // --- Database tools ---

  server.registerTool("query_database", {
    title: "Query Database",
    description: "Query a Notion database with optional filters and sorting. Returns paginated results (default 25 per page). Use start_cursor to get the next page when has_more is true.",
    inputSchema: {
      database_id: z.string().describe("The database ID (UUID from the database URL)"),
      filter: z.record(z.any()).optional().describe("Notion API filter object (e.g. { property: 'Name', title: { contains: 'Meg' } })"),
      sorts: z.array(z.record(z.any())).optional().describe("Array of Notion sort objects"),
      page_size: z.number().optional().describe("Results per page, 1-100 (default 25)"),
      start_cursor: z.string().optional().describe("Pagination cursor from a previous response"),
    },
  }, async ({ database_id, filter, sorts, page_size, start_cursor }) => {
    try {
      const params: any = { data_source_id: database_id, page_size: page_size || 25 };
      if (filter) params.filter = filter;
      if (sorts) params.sorts = sorts;
      if (start_cursor) params.start_cursor = start_cursor;
      return paginatedJson(await notion.dataSources.query(params));
    } catch (error) {
      return handleError(error);
    }
  });

  server.registerTool("get_database", {
    title: "Get Database",
    description: "Retrieve a database's schema, including all property names and types. Useful for understanding what fields a database has before querying.",
    inputSchema: {
      database_id: z.string().describe("The database ID"),
    },
  }, async ({ database_id }) => {
    try {
      return json(await notion.dataSources.retrieve({ data_source_id: database_id }));
    } catch (error) {
      return handleError(error);
    }
  });

  // --- Page tools ---

  server.registerTool("get_page", {
    title: "Get Page",
    description: "Retrieve a page's properties (title, status, dates, etc.). Does not include the page body content; use get_page_content for that.",
    inputSchema: {
      page_id: z.string().describe("The page ID"),
    },
  }, async ({ page_id }) => {
    try {
      return json(await notion.pages.retrieve({ page_id }));
    } catch (error) {
      return handleError(error);
    }
  });

  server.registerTool("get_page_content", {
    title: "Get Page Content",
    description: "Read the full body content of a page as markdown. Returns the text, headings, lists, and other content inside the page.",
    inputSchema: {
      page_id: z.string().describe("The page ID"),
    },
  }, async ({ page_id }) => {
    try {
      const response = await notion.pages.retrieveMarkdown({ page_id });
      return { content: [{ type: "text" as const, text: response.markdown }] };
    } catch (error) {
      return handleError(error);
    }
  });

  server.registerTool("create_page", {
    title: "Create Page",
    description: "Create a new page in a database. Requires the parent database ID and property values matching the database schema. Use get_database first to see available properties.",
    inputSchema: {
      database_id: z.string().describe("The parent database ID"),
      properties: z.record(z.any()).describe("Page properties matching the database schema"),
      content: z.string().optional().describe("Optional markdown content for the page body"),
    },
  }, async ({ database_id, properties, content }) => {
    try {
      const params: any = {
        parent: { type: "data_source_id", data_source_id: database_id },
        properties,
      };
      if (content) params.markdown = content;
      const page = await notion.pages.create(params);
      return json({ id: page.id, url: page.url, created: true });
    } catch (error) {
      return handleError(error);
    }
  });

  server.registerTool("update_page", {
    title: "Update Page",
    description: "Update a page's properties (e.g., name, status, dates). Only include the properties you want to change; others remain unchanged.",
    inputSchema: {
      page_id: z.string().describe("The page ID"),
      properties: z.record(z.any()).describe("Properties to update"),
    },
  }, async ({ page_id, properties }) => {
    try {
      const response = await notion.pages.update({ page_id, properties });
      return json({ id: response.id, url: response.url, updated: true });
    } catch (error) {
      return handleError(error);
    }
  });

  // --- Block tools ---

  server.registerTool("get_block_children", {
    title: "Get Block Children",
    description: "Get the child blocks of a page or block, including their IDs. Use this when you need block IDs for editing or deleting specific content. For just reading content, get_page_content is simpler.",
    inputSchema: {
      block_id: z.string().describe("The page or block ID"),
      page_size: z.number().optional().describe("Results per page, 1-100 (default 100)"),
      start_cursor: z.string().optional().describe("Pagination cursor"),
    },
  }, async ({ block_id, page_size, start_cursor }) => {
    try {
      const params: any = { block_id, page_size: page_size || 100 };
      if (start_cursor) params.start_cursor = start_cursor;
      return paginatedJson(await notion.blocks.children.list(params));
    } catch (error) {
      return handleError(error);
    }
  });

  server.registerTool("append_blocks", {
    title: "Append Blocks",
    description: "Add content blocks to the end of a page or block. Use Notion block format (e.g., paragraph, bulleted_list_item, heading_2).",
    inputSchema: {
      block_id: z.string().describe("The page or block ID to append to"),
      children: z.array(z.record(z.any())).describe("Array of Notion block objects to append"),
    },
  }, async ({ block_id, children }) => {
    try {
      const response = await notion.blocks.children.append({ block_id, children });
      return json({ appended: response.results.length, block_ids: response.results.map((b: any) => b.id) });
    } catch (error) {
      return handleError(error);
    }
  });

  server.registerTool("update_block", {
    title: "Update Block",
    description: "Update an existing block's content. Get the block ID from get_block_children first. Include the block type and new content.",
    inputSchema: {
      block_id: z.string().describe("The block ID to update"),
      block: z.record(z.any()).describe("Block update object (include the block type key with new content)"),
    },
  }, async ({ block_id, block }) => {
    try {
      const response = await notion.blocks.update({ ...block, block_id });
      return json({ id: response.id, type: response.type, updated: true });
    } catch (error) {
      return handleError(error);
    }
  });

  server.registerTool("delete_block", {
    title: "Delete Block",
    description: "Permanently delete a block and all its children. This cannot be undone via the API. Get the block ID from get_block_children first.",
    inputSchema: {
      block_id: z.string().describe("The block ID to delete"),
    },
  }, async ({ block_id }) => {
    try {
      await notion.blocks.delete({ block_id });
      return json({ block_id, deleted: true });
    } catch (error) {
      return handleError(error);
    }
  });

  // --- Search ---

  server.registerTool("search", {
    title: "Search",
    description: "Search across all pages and databases shared with the integration. Returns matching pages and databases by title.",
    inputSchema: {
      query: z.string().describe("Search query text"),
      filter_type: z.enum(["page", "data_source"]).optional().describe("Filter results to only pages or only databases (use 'data_source' for databases)"),
      page_size: z.number().optional().describe("Results per page, 1-100 (default 25)"),
      start_cursor: z.string().optional().describe("Pagination cursor"),
    },
  }, async ({ query, filter_type, page_size, start_cursor }) => {
    try {
      const params: any = { query, page_size: page_size || 25 };
      if (filter_type) params.filter = { property: "object", value: filter_type };
      if (start_cursor) params.start_cursor = start_cursor;
      return paginatedJson(await notion.search(params));
    } catch (error) {
      return handleError(error);
    }
  });

  // --- Comments ---

  server.registerTool("get_comments", {
    title: "Get Comments",
    description: "List all comments on a page or block.",
    inputSchema: {
      block_id: z.string().describe("The page or block ID"),
      page_size: z.number().optional().describe("Results per page (default 100)"),
      start_cursor: z.string().optional().describe("Pagination cursor"),
    },
  }, async ({ block_id, page_size, start_cursor }) => {
    try {
      const params: any = { block_id, page_size: page_size || 100 };
      if (start_cursor) params.start_cursor = start_cursor;
      return paginatedJson(await notion.comments.list(params));
    } catch (error) {
      return handleError(error);
    }
  });

  server.registerTool("add_comment", {
    title: "Add Comment",
    description: "Add a comment to a page. Comments appear in Notion's comment thread for that page.",
    inputSchema: {
      page_id: z.string().describe("The page ID to comment on"),
      text: z.string().describe("The comment text (plain text)"),
    },
  }, async ({ page_id, text }) => {
    try {
      const response = await notion.comments.create({
        parent: { page_id },
        rich_text: [{ type: "text", text: { content: text } }],
      });
      return json({ id: response.id, created: true });
    } catch (error) {
      return handleError(error);
    }
  });
}
