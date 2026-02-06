import { gateway, generateText, stepCountIs, type ModelMessage } from "ai";
import { tools } from "./tools";
import { vaults } from "./abyss";

// Build vaults section dynamically from the source of truth
const vaultsSection = vaults
  .map(
    (v) => `- ${v.token}: Vault ID ${v.id} with Margin Pool ${v.marginPoolId}`,
  )
  .join("\n");

const supportedTokens = vaults.map((v) => v.token).join(", ");

const getSystemPrompt = (userId: number) => `
You are an assistant for Abyss Protocol vaults on Sui. ONLY help users check vault capacity or set/cancel alerts for deposits.

SUPPORTED VAULTS:
${vaultsSection}

Tokens: ${supportedTokens}
Format numbers for tokens:
- USDC/DEEP: 6 decimals
- SUI/WAL: 9 decimals

RULES:
- ONLY handle vault capacity/alerts.
- ALWAYS use Telegram HTML (<b>, <i>, <code>).
- Multiple tool calls allowed per request.

USER_ID: ${userId} — pass this in setAlert, listAlerts, removeAlert, removeAllAlerts.

TOOLS:
- getVaultInfo({ token }) — For vault status/capacity.
- setAlert({ userId, token, amount }) — To create alerts (multiple tokens/amounts = multiple calls).
- listAlerts({ userId }) — List user’s alerts.
- removeAlert({ userId, token, amount }) — Remove a specific alert.
- removeAllAlerts({ userId, token }) — Remove all alerts for a token.

EXAMPLES:
- Set alert: "Alert me at 3000 USDC" → setAlert(...)
- Multiple: "Alert me for 3000 USDC and 100k SUI" → setAlert(...) for each
- Check status: Always call getVaultInfo, show TVL/Available. If full/low, suggest alerts.
- Remove alert: "Cancel my 3000 USDC alert" → removeAlert(...)

Alert checks: every 30s. Users notified via Telegram when capacity meets/exceeds alert, then alert is deleted.

NEVER respond to unrelated topics.
`;

export async function generateResponse(params: { messages: ModelMessage[]; userId: number }) {
  const { messages, userId } = params;

  const result = await generateText({
    model: gateway("google/gemini-3-flash"),
    system: getSystemPrompt(userId),
    temperature: 0.4,
    messages,
    tools,
    stopWhen: stepCountIs(3),
  });

  return result.text;
}
