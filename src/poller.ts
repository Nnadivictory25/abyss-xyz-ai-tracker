import { getAlertsToTrigger, deleteAlertsById } from "./db";
import { fetchVaultAndPool, calculateVaultAmounts } from "./abyss";
import { bot } from "./bot";

const POLL_INTERVAL = 30 * 1000; // 30 seconds

function formatAmount(rawAmount: string, decimals: number): string {
  const amount = Number(rawAmount) / 10 ** decimals;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

interface Alert {
  id: number;
  user_id: number;
  amount: number;
}

async function checkAndAlertForToken(token: TokenType) {
  const data = await fetchVaultAndPool(token);
  if (!data) return;

  const amounts = calculateVaultAmounts(data.vault, data.pool);
  const decimals = token === "USDC" || token === "DEEP" ? 6 : 9;

  // Get alerts that should be triggered (filtered in SQL, amounts already in base units)
  const alerts = getAlertsToTrigger(token, amounts.availableCapacity);

  if (alerts.length === 0) return;

  console.log(`🔔 ${alerts.length} alerts to send for ${token} vault`);

  // Send all alerts concurrently
  const alertPromises = alerts.map(async (alert) => {
    try {
      const formattedCapacity = formatAmount(amounts.availableCapacity, decimals);
      // alert.amount is already in base units, convert back to human-readable for display
      const formattedThreshold = formatAmount(String(alert.amount), decimals);

      await bot.api.sendMessage(
        alert.user_id,
        `🎉 <b>${token} Vault Alert!</b>\n\n` +
          `The vault now has <b>${formattedCapacity} ${token}</b> available for deposit.\n\n` +
          `You requested an alert when capacity reached ${formattedThreshold} ${token}.\n\n` +
          `Deposit now before it fills up!`,
        { parse_mode: "HTML" }
      );

      console.log(`✅ Alert sent to user ${alert.user_id} for ${token} vault (threshold: ${alert.amount})`);
      return { success: true, alertId: alert.id };
    } catch (error) {
      console.error(`❌ Failed to send alert to user ${alert.user_id}:`, error);
      return { success: false, alertId: alert.id };
    }
  });

  // Wait for all alerts to complete
  const results = await Promise.all(alertPromises);

  // Delete all triggered alerts by ID
  const alertIds = results.map((r) => r.alertId);
  if (alertIds.length > 0) {
    deleteAlertsById(alertIds);
    console.log(`🗑️ Deleted ${alertIds.length} triggered alerts for ${token}`);
  }
}

async function checkAndAlert() {
  try {
    // Check all vaults in parallel
    await Promise.all([
      checkAndAlertForToken("USDC"),
      checkAndAlertForToken("SUI"),
      checkAndAlertForToken("WAL"),
      checkAndAlertForToken("DEEP"),
    ]);
  } catch (error) {
    console.error("❌ Error in alert poller:", error);
  }
}

export function startAlertPoller() {
  console.log("🚀 Starting vault alert poller (30s interval)...");

  // Run immediately on start
  checkAndAlert();

  // Then every 30 seconds
  setInterval(checkAndAlert, POLL_INTERVAL);
}

// If running standalone
if (import.meta.main) {
  startAlertPoller();
}
