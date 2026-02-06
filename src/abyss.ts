import { SuiGraphQLClient } from '@mysten/sui/graphql';

export const vaults: VaultArray[] = [
	{
		id: '0x86cd17116a5c1bc95c25296a901eb5ea91531cb8ba59d01f64ee2018a14d6fa5',
		marginPoolId: '0xba473d9ae278f10af75c50a8fa341e9c6a1c087dc91a3f23e8048baf67d0754f',
		token: 'USDC',
	},
	{
		id: '0x670c12c8ea3981be65b8b11915c2ba1832b4ebde160b03cd7790021920a8ce68',
		marginPoolId: '0x53041c6f86c4782aabbfc1d4fe234a6d37160310c7ee740c915f0a01b7127344',
		token: 'SUI',
	},
	{
		id: '0x09b367346a0fc3709e32495e8d522093746ddd294806beff7e841c9414281456',
		marginPoolId: '0x38decd3dbb62bd4723144349bf57bc403b393aee86a51596846a824a1e0c2c01',
		token: 'WAL',
	},
	{
		id: '0xec54bde40cf2261e0c5d9c545f51c67a9ae5a8add9969c7e4cdfe1d15d4ad92e',
		marginPoolId: '0x1d723c5cd113296868b55208f2ab5a905184950dd59c48eb7345607d6b5e6af7',
		token: 'DEEP',
	}
]

const client = new SuiGraphQLClient({
	url: 'https://graphql.mainnet.sui.io/graphql',
	network: 'mainnet',
});

/**
 * Fetches both vault and its associated margin pool in a single request
 * @param token - The token type to fetch (uses predefined vaults array)
 * @returns Object containing both vault and pool data, or null if not found
 */
export async function fetchVaultAndPool(token: TokenType): Promise<{ vault: AbyssVault; pool: AbyssMarginPool } | null> {
  const vaultInfo = vaults.find(v => v.token === token);
  if (!vaultInfo) {
    console.error(`No vault configured for token: ${token}`);
    return null;
  }

  // Fetch both objects in a single request
  const { objects } = await client.core.getObjects({
    objectIds: [vaultInfo.id, vaultInfo.marginPoolId],
    include: { json: true },
  });

  // Handle errors for each object
  const [vaultResult, poolResult] = objects;
  
  if (!vaultResult || vaultResult instanceof Error) {
    console.error('Error fetching vault:', vaultResult instanceof Error ? vaultResult.message : 'Not found');
    return null;
  }
  
  if (!poolResult || poolResult instanceof Error) {
    console.error('Error fetching margin pool:', poolResult instanceof Error ? poolResult.message : 'Not found');
    return null;
  }

  if (!vaultResult.json || !poolResult.json) {
    console.error('Missing JSON content for vault or pool');
    return null;
  }

  console.log("Fetched vault and pool data");

  return {
    vault: vaultResult.json as AbyssVault,
    pool: poolResult.json as AbyssMarginPool,
  };
}

/**
 * Calculates vault amounts using on-chain data
 * Matches Abyss API methodology: TVL = aToken_supply × exchange_rate
 * @param vault - Vault object from on-chain
 * @param pool - Margin pool object from on-chain
 * @returns An object with totalDeposited and availableCapacity in underlying units
 */
export function calculateVaultAmounts(vault: AbyssVault, pool: AbyssMarginPool) {
  // Get aToken supply (what users hold)
  const aTokenSupply = BigInt(vault.atoken_treasury_cap.total_supply.value);
  
  // Calculate exchange rate: total_supply / supply_shares
  // This is how much underlying asset each share is worth
  const totalSupply = BigInt(pool.state.total_supply);
  const supplyShares = BigInt(pool.state.supply_shares);
  const exchangeRate = (totalSupply * BigInt(1_000_000_000)) / supplyShares;
  
  // Total deposited (TVL) = aToken_supply × exchange_rate / 1e9
  // This matches the API's total_assets calculation
  const totalDeposited = (aTokenSupply * exchangeRate) / BigInt(1_000_000_000);
  
  // Available capacity = supply_cap - total_supply (space before pool cap)
  const supplyCap = BigInt(pool.config.margin_pool_config.supply_cap);
  const availableCapacity = supplyCap > totalSupply ? (supplyCap - totalSupply).toString() : "0";

  return {
    totalDeposited: totalDeposited.toString(),  // TVL matching API methodology
    availableCapacity,                          // How much can still be deposited
    exchangeRate: exchangeRate.toString(),     // Current exchange rate
  };
}
