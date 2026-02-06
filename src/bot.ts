import { Bot, type Context } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { stream, type StreamFlavor } from "@grammyjs/stream";
import { appendMessage, clearConversation, createUser, getUser, loadConversation } from "./db";
import { generateResponse } from "./ai";

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
    `Hello, <b>${ctx.from?.first_name}</b>! I will help you track when a vault in Abyss.xyz is free for deposit or if you want to know when a particular amount can be deposited. Just talk to me like a human and I will help you out.`,
    { parse_mode: "HTML" }
  );
});

bot.command("clear", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  clearConversation(userId);
  await ctx.reply("<i>Conversation cleared.</i>", { parse_mode: "HTML" });
});

bot.on("message:text", async (ctx) => {
  const userId = ctx.from?.id;
  const text = ctx.message?.text;
  if (!userId || !text) return;
  if (!getUser(userId)) return;

  appendMessage({ userId, role: "user", content: text });
  const history = loadConversation({ userId });
  
  console.log("Generating response for user..");
  
  // Send loading indicator
  const loadingMsg = await ctx.reply("⏳");
  await ctx.api.sendChatAction(ctx.chat.id, "typing");
  
  try {
    // Generate response
    const response = await generateResponse({
      messages: history,
      userId,
    });
    
    // Delete loading message
    await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id);
    
    // Send the response with HTML formatting
    await ctx.reply(response, { parse_mode: "HTML" });
    
    // Save to conversation history
    appendMessage({ userId, role: "assistant", content: response });
    
  } catch (error) {
    console.error("Error generating response:", error);
    await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id);
    await ctx.reply("<i>❌ Sorry, I encountered an error. Please try again.</i>", { parse_mode: "HTML" });
  }
});
