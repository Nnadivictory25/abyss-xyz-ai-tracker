import { Bot, type Context } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { stream, type StreamFlavor } from "@grammyjs/stream";
import { appendMessage, clearConversation, createUser, getUser, loadConversation } from "./db";
import { streamResponse } from "./ai";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is not set");
}

type BotContext = StreamFlavor<Context>;
export const bot = new Bot<BotContext>(BOT_TOKEN);

bot.api.config.use(autoRetry());
bot.use(stream());

bot.command("start", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  createUser(userId);
  await ctx.reply(
    `Hello, ${ctx.from?.first_name}! I will help you track when a vault in Abyss.xyz is free for deposit or if you want to know when a particular amount can be deposited. Just talk to me like a human and I will help you out.`
  );
});

bot.command("clear", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  clearConversation(userId);
  await ctx.reply("Conversation cleared.");
});

bot.on("message:text", async (ctx) => {
  const userId = ctx.from?.id;
  const text = ctx.message?.text;
  if (!userId || !text) return;
  if (!getUser(userId)) return;

  appendMessage({ userId, role: "user", content: text });
  const history = loadConversation({ userId });
  
  const result = streamResponse({
    messages: history,
    userId,
    onFinish: ({ text: finalText }) => {
      appendMessage({ userId, role: "assistant", content: finalText });
    },
  });

  await ctx.replyWithStream(result.textStream);
});
