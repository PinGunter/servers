import mock from "./mock.json" with { type: "json" };;
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ClientCapabilities,
  ListToolsRequestSchema,
  LoggingLevel,
  RootsListChangedNotificationSchema,
  Tool,
  ToolSchema,
  type Root,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const instructions = readFileSync(join(__dirname, "instructions.md"), "utf-8");

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

const ToolOutputSchema = ToolSchema.shape.outputSchema;
type ToolOutput = z.infer<typeof ToolOutputSchema>;

/* Input schemas for tools implemented in this server */
const searchSchema = {
  input: z.object({
    query: z.string().describe("Search query"),
  }),
  output: z.object({
    results: z
      .array(
        //   z.object({
        //     // recordType: z.string().describe("Record type of the result"),
        //     id: z
        //       .string()
        //       .describe("Search id of the result. Used in fetch tool"),
        //     text: z.string().describe("Name of the record"),
        //     title: z.string().describe("Record type of the result"),
        //     url: z
        //       .string()
        //       // .optional()
        //       .describe("First line of information of the record"),
        //     // info2: z
        //     //   .string()
        //     //   .optional()
        //     //   .describe("Second line of information of the record"),
        //   })
        // )
        z.record(z.unknown())
      )
      .describe("Array of search results"),
  }),
};

const fetchSchema = {
  input: z.object({
    id: z.string().describe("The report id"),
  }),
  output: z.record(z.unknown()),
  // z.object({
  //   // recordType: z.string().describe("Record type of the result"),
  //   id: z.string().describe("Search id of the result. Used in fetch tool"),
  //   text: z.string().describe("Name of the record"),
  //   title: z.string().describe("Record type of the result"),
  //   url: z
  //     .string()
  //     // .optional()
  //     .describe("First line of information of the record"),
  //   // info2: z
  //   //   .string()
  //   //   .optional()
  //   //   .describe("Second line of information of the record"),
  // }),
};

enum ToolName {
  SEARCH = "search",
  FETCH = "fetch",
}

export const createServer = () => {
  const server = new Server(
    {
      name: "example-servers/everything",
      title: "Everything Example Server",
      version: "1.0.0",
    },
    {
      capabilities: {
        prompts: {},
        resources: { subscribe: true },
        tools: {},
        logging: {},
        completions: {},
      },
      instructions,
    }
  );

  let subscriptions: Set<string> = new Set();
  let subsUpdateInterval: NodeJS.Timeout | undefined;
  let stdErrUpdateInterval: NodeJS.Timeout | undefined;

  let logsUpdateInterval: NodeJS.Timeout | undefined;
  // Store client capabilities
  let clientCapabilities: ClientCapabilities | undefined;

  // Roots state management
  let currentRoots: Root[] = [];
  let clientSupportsRoots = false;
  let sessionId: string | undefined;

  // Function to start notification intervals when a client connects
  const startNotificationIntervals = (sid?: string | undefined) => {
    sessionId = sid;
    if (!subsUpdateInterval) {
      subsUpdateInterval = setInterval(() => {
        for (const uri of subscriptions) {
          server.notification({
            method: "notifications/resources/updated",
            params: { uri },
          });
        }
      }, 10000);
    }

    // console.log(sessionId);
    const maybeAppendSessionId = sessionId ? ` - SessionId ${sessionId}` : "";
    const messages: { level: LoggingLevel; data: string }[] = [
      { level: "debug", data: `Debug-level message${maybeAppendSessionId}` },
      { level: "info", data: `Info-level message${maybeAppendSessionId}` },
      { level: "notice", data: `Notice-level message${maybeAppendSessionId}` },
      {
        level: "warning",
        data: `Warning-level message${maybeAppendSessionId}`,
      },
      { level: "error", data: `Error-level message${maybeAppendSessionId}` },
      {
        level: "critical",
        data: `Critical-level message${maybeAppendSessionId}`,
      },
      { level: "alert", data: `Alert level-message${maybeAppendSessionId}` },
      {
        level: "emergency",
        data: `Emergency-level message${maybeAppendSessionId}`,
      },
    ];

    if (!logsUpdateInterval) {
      console.error("Starting logs update interval");
      logsUpdateInterval = setInterval(async () => {
        await server.sendLoggingMessage(
          messages[Math.floor(Math.random() * messages.length)],
          sessionId
        );
      }, 15000);
    }
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [
      {
        name: ToolName.SEARCH,
        // description:
        // "Performs a global search on your Netsuite account. Allows you to search anything using keywords. Returns a list of search results with basic information. Each result includes an id that can be used for a deeper lookup.",
        description:
          "This tool returns a list of the available Netsuite reports based on a keyword-based query",
        inputSchema: zodToJsonSchema(searchSchema.input) as ToolInput,
        outputSchema: zodToJsonSchema(searchSchema.output) as ToolOutput,
      },
      {
        name: ToolName.FETCH,
        description: "Runs and returns a full report in netsuite.",
        inputSchema: zodToJsonSchema(fetchSchema.input) as ToolInput,
        outputSchema: zodToJsonSchema(fetchSchema.output) as ToolOutput,
      },
    ];

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const mockedResults = {
      items: [
        {
          id: "1",
          title: "Toro Loco SL",
          text: "El toro loco, los mas locos",
          url: "https://netsuite.com/toroloco",
        },
        {
          id: "2",
          title: "Doofensmirth SL",
          text: "Malvados y asociados",
          url: "https://netsuite.com/doof",
        },
        {
          id: "3",
          title: "Pan el Vacar",
          text: "El mejor pan de la pedanía #ad",
          url: "https://netsuite.com/panvacar",
        },
      ],
    };
    if (name === ToolName.SEARCH) {
      const validatedArgs = searchSchema.input.parse(args);
      const { query } = validatedArgs;
      console.log("Calling search tool with query:", query);
      // const globalUrl =
      //   "https://11834545.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=1&deploy=1&compid=11834545&ns-at=AAEJ7tMQWGLV4Lg2jaG2GzkSEtMyfulC4l7cxMnTummuJqxEK4A";
      const reportUrl =
        "https://11834545.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=3&deploy=1&compid=11834545&ns-at=AAEJ7tMQvbOIghaLdZuWEjt8opEeavLJ6MCJDbSdF5AhpTesUbg";
      // const data = await fetch(
      //   `${reportUrl}&query=${encodeURIComponent(query)}`
      // );
      // const results = await data.json();

      const results = {
        items: [{
          id: "-202",
          name: "Balance Sheet Report"
        }]
      }

      const response = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: results.items,
              // results: mockedResults.items.filter((r) =>
              //   r.title.toLowerCase().includes(query.toLowerCase())
              // ),
            }),
          },
        ],
        structuredContent: { results: results.items },
        // {
        // results: [
        //   ...mockedResults.items.filter((r) =>
        //     r.title.toLowerCase().includes(query.toLowerCase())
        //   ),
        // ],
        // },
      };
      console.log(response);
      return response;
    }
    if (name === ToolName.FETCH) {
      const validatedArgs = fetchSchema.input.parse(args);
      const { id } = validatedArgs;
      console.log("Calling fetch tool with id:", id);
      // const globalUrl =
      //   "https://11834545.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2&deploy=1&compid=11834545&ns-at=AAEJ7tMQSdTK5WmyXEanu8oXT_rKK9IrvGJtv19Y3ClmRv3A9H4";
      // const reportUrl =
      //   "https://11834545.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4&deploy=1&compid=11834545&ns-at=AAEJ7tMQtbzZ19jylJN7v38LCIfl0yhSQ7ewVCUcOkriPQAppL4";
      // const data = await fetch(`${reportUrl}&id=${encodeURIComponent(id)}`);
      // const results = await data.json();

      // const response = {
      //   content: [
      //     {
      //       type: "text",
      //       text: JSON.stringify({
      //         ...mockedResults.items.filter((r) => r.id === id)[0],
      //       }),
      //     },
      //   ],
      //   structuredContent: {
      //     ...mockedResults.items.filter((r) => r.id === id)[0],
      //   },
      // };

      const response = {
        content: [{ type: "text", text: JSON.stringify(mock) }],
        structuredContent: mock,
      };
      console.log(response);

      return response;
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  // Roots protocol handlers
  server.setNotificationHandler(
    RootsListChangedNotificationSchema,
    async () => {
      try {
        // Request the updated roots list from the client
        const response = await server.listRoots();
        if (response && "roots" in response) {
          currentRoots = response.roots;

          // Log the roots update for demonstration
          await server.sendLoggingMessage(
            {
              level: "info",
              logger: "everything-server",
              data: `Roots updated: ${currentRoots.length} root(s) received from client`,
            },
            sessionId
          );
        }
      } catch (error) {
        await server.sendLoggingMessage(
          {
            level: "error",
            logger: "everything-server",
            data: `Failed to request roots from client: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
          sessionId
        );
      }
    }
  );

  // Handle post-initialization setup for roots
  server.oninitialized = async () => {
    clientCapabilities = server.getClientCapabilities();

    if (clientCapabilities?.roots) {
      clientSupportsRoots = true;
      try {
        const response = await server.listRoots();
        if (response && "roots" in response) {
          currentRoots = response.roots;

          await server.sendLoggingMessage(
            {
              level: "info",
              logger: "everything-server",
              data: `Initial roots received: ${currentRoots.length} root(s) from client`,
            },
            sessionId
          );
        } else {
          await server.sendLoggingMessage(
            {
              level: "warning",
              logger: "everything-server",
              data: "Client returned no roots set",
            },
            sessionId
          );
        }
      } catch (error) {
        await server.sendLoggingMessage(
          {
            level: "error",
            logger: "everything-server",
            data: `Failed to request initial roots from client: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
          sessionId
        );
      }
    } else {
      await server.sendLoggingMessage(
        {
          level: "info",
          logger: "everything-server",
          data: "Client does not support MCP roots protocol",
        },
        sessionId
      );
    }
  };

  const cleanup = async () => {
    if (subsUpdateInterval) clearInterval(subsUpdateInterval);
    if (logsUpdateInterval) clearInterval(logsUpdateInterval);
    if (stdErrUpdateInterval) clearInterval(stdErrUpdateInterval);
  };

  return { server, cleanup, startNotificationIntervals };
};
