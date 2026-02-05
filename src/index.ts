import "./db";
import { webhookCallback } from "grammy";
import { bot } from "./bot";
import { startAlertPoller } from "./poller";

const PORT = Number(process.env.PORT ?? 3000);
const WEBHOOK_PATH = "/tg-bot";

// Start the vault alert poller
startAlertPoller();

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== WEBHOOK_PATH) return new Response("Not Found", { status: 404 });
    if (req.method !== "POST") return new Response("Method Not Allowed!!", { status: 405 });
    return webhookCallback(bot, "bun")(req);
  },
});

console.log(`Webhook listener on :${PORT}${WEBHOOK_PATH}`);
