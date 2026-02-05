import { tool } from "ai";
import { z } from "zod";
import { calculateVaultAmounts, fetchVaultAndPool } from "./abyss";
import {
  trackToken,
  getUserAlerts,
  untrackSpecificAmount,
  deleteAlertsById,
} from "./db";

// Token decimals mapping
const TOKEN_DECIMALS: Record<TokenType, number> = {
  USDC: 6,
  SUI: 9,
  DEEP: 6,
  WAL: 9,
};

function formatAmount(rawAmount: string, decimals: number): string {
  const factor = 10 ** decimals;
  const amount = Number(rawAmount) / factor;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatAmountFromNumber(amount: number, decimals: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export const getVaultInfoTool = tool({
  description:
    "Get current vault information including total deposited and available capacity. Fetches on-chain data and performs calculations automatically.",
  inputSchema: z.object({
    token: z
      .enum(["USDC", "SUI"])
      .describe(
        "The token type to get vault info for (currently USDC, SUI are supported)"
      ),
  }),
  execute: async ({ token }) => {
    const data = await fetchVaultAndPool(token as TokenType);
    if (!data) {
      return { error: `Failed to fetch vault data for ${token}` };
    }

    const amounts = calculateVaultAmounts(data.vault, data.pool);
    const decimals = TOKEN_DECIMALS[token as TokenType];

    return {
      token,
      totalDeposited: {
        raw: amounts.totalDeposited,
        formatted: formatAmount(amounts.totalDeposited, decimals),
        unit: token,
      },
      availableCapacity: {
        raw: amounts.availableCapacity,
        formatted: formatAmount(amounts.availableCapacity, decimals),
        unit: token,
        description:
          "Amount available for new deposits before hitting pool supply cap",
      },
      vaultInfo: {
        vaultId: data.vault.id,
        marginPoolId: data.vault.margin_pool_id,
        underlyingDecimals: data.vault.underlying_decimals,
      },
    };
  },
});

export const setAlertTool = tool({
  description:
    "Set a vault capacity alert for a user. When the specified token's vault has at least the requested amount available, the user will receive a Telegram notification. Multiple alerts can be set for the same token with different thresholds.",
  inputSchema: z.object({
    userId: z.number().describe("The Telegram user ID"),
    token: z.enum(["USDC", "SUI"]).describe("The token vault to monitor"),
    amount: z
      .number()
      .positive()
      .describe(
        "The minimum available capacity threshold in human-readable units (e.g., 3000 for 3000 USDC, 100000 for 100000 SUI)"
      ),
  }),
  execute: async ({ userId, token, amount }) => {
    try {
      trackToken({ userId, token: token as TokenType, amount });
      return {
        success: true,
        message: `✅ Alert set! I'll notify you when the ${token} vault has at least ${amount.toLocaleString()} ${token} available for deposit.`,
        token,
        amount,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Failed to set alert: ${error}`,
        token,
        amount,
      };
    }
  },
});

export const listAlertsTool = tool({
  description:
    "List all active vault capacity alerts for a user. Shows both the token and the threshold amount for each alert.",
  inputSchema: z.object({
    userId: z.number().describe("The Telegram user ID"),
  }),
  execute: async ({ userId }) => {
    try {
      const alerts = getUserAlerts(userId);

      if (alerts.length === 0) {
        return {
          hasAlerts: false,
          message:
            "You don't have any active alerts. Use commands like 'alert me when USDC has 3000 available' to set one up!",
        };
      }

      // Format alerts by converting base units back to human-readable
      const formattedAlerts = alerts.map((alert) => {
        const decimals = alert.token === "USDC" ? 6 : 9;
        const humanReadable = alert.amount / 10 ** decimals;
        return {
          token: alert.token,
          threshold: humanReadable,
          formatted: `${humanReadable.toLocaleString()} ${alert.token}`,
        };
      });

      return {
        hasAlerts: true,
        count: alerts.length,
        alerts: formattedAlerts,
        message: `You have ${alerts.length} active alert(s):\n${formattedAlerts.map((a) => `- ${a.formatted}`).join("\n")}`,
      };
    } catch (error) {
      return {
        hasAlerts: false,
        message: `❌ Failed to retrieve alerts: ${error}`,
      };
    }
  },
});

export const removeAlertTool = tool({
  description:
    "Remove a specific vault capacity alert for a user. Requires the exact token and amount that was used when creating the alert.",
  inputSchema: z.object({
    userId: z.number().describe("The Telegram user ID"),
    token: z.enum(["USDC", "SUI"]).describe("The token of the alert to remove"),
    amount: z
      .number()
      .positive()
      .describe(
        "The exact threshold amount in human-readable units (e.g., 3000 for 3000 USDC)"
      ),
  }),
  execute: async ({ userId, token, amount }) => {
    try {
      untrackSpecificAmount({
        userId,
        token: token as TokenType,
        amount,
      });
      return {
        success: true,
        message: `✅ Removed alert for ${amount.toLocaleString()} ${token}.`,
        token,
        amount,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Failed to remove alert: ${error}`,
        token,
        amount,
      };
    }
  },
});

export const removeAllAlertsTool = tool({
  description:
    "Remove all vault capacity alerts for a specific token for a user. Use this when the user wants to cancel all alerts for a token.",
  inputSchema: z.object({
    userId: z.number().describe("The Telegram user ID"),
    token: z
      .enum(["USDC", "SUI"])
      .describe("The token to remove all alerts for"),
  }),
  execute: async ({ userId, token }) => {
    try {
      // Get all alerts for this user/token
      const alerts = getUserAlerts(userId);
      const alertsToRemove = alerts.filter((a) => a.token === token);

      if (alertsToRemove.length === 0) {
        return {
          success: true,
          message: `No alerts found for ${token}.`,
          token,
          removedCount: 0,
        };
      }

      // Delete all alerts for this token
      // Since we need to delete by ID, we need to query for them first
      // For now, we'll iterate and delete by amount
      for (const alert of alertsToRemove) {
        const decimals = alert.token === "USDC" ? 6 : 9;
        const humanReadable = alert.amount / 10 ** decimals;
        untrackSpecificAmount({
          userId,
          token: alert.token as TokenType,
          amount: humanReadable,
        });
      }

      return {
        success: true,
        message: `✅ Removed ${alertsToRemove.length} alert(s) for ${token}.`,
        token,
        removedCount: alertsToRemove.length,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Failed to remove alerts: ${error}`,
        token,
        removedCount: 0,
      };
    }
  },
});

export const tools = {
  getVaultInfo: getVaultInfoTool,
  setAlert: setAlertTool,
  listAlerts: listAlertsTool,
  removeAlert: removeAlertTool,
  removeAllAlerts: removeAllAlertsTool,
};
