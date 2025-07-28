// relay/index.js
import { OpenAI } from "openai";
import http from "http";

// 1. Load and validate environment variables
const apiKey = process.env.OPENAI_API_KEY;
const assistantId = process.env.WORKER_ASSISTANT_ID;
const port = parseInt(process.env.PORT || "3001", 10);

if (!apiKey || !assistantId) {
  console.error("Missing OPENAI_API_KEY or WORKER_ASSISTANT_ID in environment.");
  process.exit(1);
}

// 2. Define a helper function to read the request body
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString() || "{}";
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error("Invalid JSON body");
  }
}

// 3. Create and configure the HTTP server
const server = http.createServer(async (req, res) => {
  // 4. Implement basic routing and method validation
  if (req.method !== "POST" || req.url !== "/ask-worker") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Only POST /ask-worker is allowed" }));
  }

  try {
    // 5. Parse and validate the incoming prompt
    const { prompt } = await readBody(req);
    if (!prompt || typeof prompt !== "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Property 'prompt' is required" }));
    }

    // 6. Instantiate the OpenAI client and orchestrate the Assistant run
    const openai = new OpenAI({ apiKey });
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: prompt,
    });
    const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistantId,
    });

    if (run.status !== "completed") {
      throw new Error(`Assistant run failed: ${run.status}`);
    }

    // 7. Retrieve the final message and send the response
    const messages = await openai.beta.threads.messages.list(thread.id, { limit: 1 });
    const narrative = messages.data?.content?.text?.value || "";

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ narrative }));

  } catch (err) {
    // 8. Implement generic error handling
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Worker GPT failed" }));
  }
});

// 9. Start the server
server.listen(port, () => {
  console.log(`Relay listening on http://localhost:${port}`);
});