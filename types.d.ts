type TokenType =
  | "USDC"
  | "SUI"
  | "DEEP"
  | "WAL"

type TrackTokenInput = {
  userId: number;
  token: TokenType;
  amount: number;
};

type UntrackTokenInput = {
  userId: number;
  token: TokenType;
};

type ConversationRole = "user" | "assistant";

type AppendMessageInput = {
  userId: number;
  role: ConversationRole;
  content: string;
};

type LoadConversationInput = {
  userId: number;
  limit?: number;
};

type StreamResponseInput = {
  messages: import("ai").ModelMessage[];
  userId: number;
  onFinish?: import("ai").StreamTextOnFinishCallback<any>;
};


// abyss
type VaultArray = {
  id: string;
  marginPoolId: string;
  token: TokenType;
};

// Vault object
type AbyssVault = {
  id: string;
  margin_pool_id: string;
  asset_type: string;
  // aToken supply (what users hold)
  atoken_treasury_cap: {
    total_supply: {
      value: string;
    };
  };
  // Actual vault state
  abyss_vault_state: {
    margin_pool_shares: string;
  };
  // API provided metrics
  total_supply: string;        // same as atoken supply
  total_assets: string;        // actual assets in vault
  max_supply: string;          // AVAILABLE CAPACITY for deposits (this is what we need!)
  max_withdraw: string;        // max withdrawable
  atoken_to_assets_rate: string;
  atoken_to_mp_share_rate: string;
  total_earnings: string;
  protocol_fee: string;
  underlying_decimals: number;
};

// Margin Pool object
type AbyssMarginPool = {
  vault: string; // amount of assets this vault has in the pool
  state: {
    total_supply: string; // total pool supply in USDC
    total_borrow: string;  // total borrowed amount in USDC
    supply_shares: string; // total supply shares
    borrow_shares: string; // total borrow shares
    last_update_timestamp: string;
  };
  config: {
    margin_pool_config: {
      supply_cap: string; // maximum supply cap for the pool
      protocol_spread: string;
    };
    interest_config: {
      base_rate: string;
      base_slope: string;
      optimal_utilization: string;
      excess_slope: string;
    };
  };
  protocol_fees: {
    fees_per_share: string;
    total_shares: string;
  };
};

