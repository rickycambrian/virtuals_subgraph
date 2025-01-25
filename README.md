# Virtuals Protocol Token Launch Subgraph

https://thegraph.com/explorer/subgraphs/FJ42AgdSR7rg9CTY7eUB7MPZbhmih4xKoXEUfh8oHroc

This subgraph indexes token launches and trading activity from the Virtuals Protocol on Base network. It tracks token launches, swaps, market statistics, and detailed trading analytics from the protocol contract at `0xF66DeA7b3e897cD44A5a231c61B6B4423d613259`.

## Features

- Full-text search capabilities for tokens and descriptions
- Non-fatal error handling for improved reliability
- IPFS on Ethereum contracts support
- Automatic data pruning
- Comprehensive trading analytics and market statistics
- Global and core-specific agent rankings
- Market impact analysis and graduation effects
- Cross-agent analytics and network effects
- Advanced validator network analysis
- Risk metrics and stability indicators

## Schema

The subgraph tracks the following data:

### Token Launch Data
- Basic token information (address, creator, timestamp)
- Token metadata (name, ticker, description, image)
- Launch parameters (cores, purchase amount, URLs)

### Trading Data
- Swap events with detailed trade information
- Token supply tracking
- Trade snapshots for historical analysis
- Comprehensive daily statistics
- Per-trader analytics

### Agent Rankings & Performance
- Global rankings (impact, stake, rewards)
- Core-specific performance metrics
- Historical rank tracking
- Market impact scores
- Network effect measurements

### Market Impact Analysis
- Price impact correlation
- Graduation event effects
- Liquidity provider behavior
- Market stability metrics
- Token velocity analysis

### Validator Network Analysis
- Cross-agent validation patterns
- Validator specialization metrics
- Network effect measurements
- Performance correlation data
- Reliability indicators

### Risk Metrics
- Agent stability scores
- Validator reliability indices
- Stake concentration analysis
- Market health indicators
- Liquidity risk metrics

## Example Queries

### Get Recent Token Launches

```graphql
{
  tokenLaunches(
    first: 5,
    orderBy: timestamp,
    orderDirection: desc
  ) {
    id
    address
    tokenCreator
    name
    ticker
    description
    imageUrl
    cores
    purchaseAmount
    createdAtBlock
    timestamp
  }
}
```

### Get Agent Rankings

```graphql
{
  agents(
    first: 10,
    orderBy: performanceRank,
    orderDirection: asc
  ) {
    id
    virtualId
    impactRank
    stakeRank
    rewardRank
    validatorRank
    priceImpactScore
    marketStability
    historicalRanks(first: 30) {
      timestamp
      totalRank
    }
    coreTypeRanks {
      coreType
      rank
      score
    }
  }
}
```

### Get Market Impact Analysis

```graphql
{
  agents(where: { graduatedToUniswap: true }) {
    id
    priceImpactScore
    marketStability
    liquidityProviderCount
    postGraduationMetrics {
      priceBeforeGraduation
      priceAfterGraduation
      marketEfficiencyChange
    }
  }
}
```

### Get Daily Trading Statistics

```graphql
{
  tokenDayStats(
    first: 10,
    orderBy: volumeUSD,
    orderDirection: desc
  ) {
    token
    date
    openPrice
    closePrice
    volumeUSD
    txCount
    uniqueTraderCount
    marketCap
    priceVolatility
    buyPressure
    liquidityScore
  }
}
```

### Get Trader Performance Analytics

```graphql
{
  tokenTraderStats(
    where: {
      volumeUSD_gt: "1000"
    }
  ) {
    trader
    token
    date
    txCount
    volumeUSD
    realizedPnL
    profitabilityRatio
    averagePositionSize
    winningStreak
  }
}
```

### Get Market Depth and Health Metrics

```graphql
{
  tokenDayStats(
    where: {
      token: "0x..."  # Replace with token address
    }
    orderBy: date,
    orderDirection: desc
  ) {
    date
    marketDepth
    liquidityScore
    marketEfficiency
    buyPressure
    volumeWeightedPrice
    priceVolatility
  }
}
```

## Setup & Development

1. Install dependencies:
```bash
yarn install
```

2. Generate types:
```bash
yarn codegen
```

3. Build the subgraph:
```bash
yarn build
```

## Deployment

1. First, create a new subgraph on [The Graph Studio](https://thegraph.com/studio/):
   - Go to https://thegraph.com/studio/
   - Click "Create a Subgraph"
   - Name it "virtuals-tokens"
   - Select "Base" as the network

2. Get your deploy key from the Graph Studio dashboard

3. Authenticate with the Graph CLI:
```bash
graph auth <your-deploy-key>
```

4. Deploy the subgraph:
```bash
graph deploy virtuals-tokens
```

When prompted for a version label, use semantic versioning (e.g., "1.0.0")

## Making Changes

1. Modify the schema in `schema.graphql`
2. Update the subgraph manifest in `subgraph.yaml`
3. Update the mappings in `src/mappings/agent.ts`
4. Regenerate types:
```bash
yarn codegen
```
5. Build:
```bash
yarn build
```
6. Deploy new version:
```bash
graph deploy virtuals-tokens
```

## Notes

- The subgraph starts indexing from block 21841737
- Features comprehensive trading analytics and market statistics
- Supports fulltext search on token addresses, names, tickers, and descriptions
- Includes detailed market health metrics and trader performance analytics
- Tracks daily statistics and peak trading hours for market analysis
- Provides advanced analytics like price impact, market efficiency, and trader profitability
- Implements global and core-specific agent rankings
- Tracks market impact and graduation effects
- Analyzes validator network patterns and specialization
- Monitors risk metrics and market stability indicators
