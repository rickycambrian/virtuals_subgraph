# Virtuals Protocol Token Launch Subgraph

This subgraph indexes token launches from the Virtuals Protocol on Base network. It tracks both the Launched events and launch function calls from the contract at `0xF66DeA7b3e897cD44A5a231c61B6B4423d613259`.

## Latest Endpoint

- Queries (HTTP): https://api.studio.thegraph.com/query/7428/virtuals-tokens/1.0.0

## Schema

The subgraph tracks the following data for each token launch:

### Event Data
- `address`: The launched token address (as string for searchability)
- `addressBytes`: The raw token address bytes
- `createdAtBlock`: Block number when the token was created
- `createdAtTx`: Transaction hash of the creation
- `tokenCreator`: Address of the token creator (as string for searchability)
- `tokenCreatorBytes`: The raw creator address bytes
- `timestamp`: Timestamp of the creation

### Launch Function Data
- `name`: Token name
- `ticker`: Token ticker symbol
- `cores`: Array of core numbers
- `description`: Token description
- `imageUrl`: Token image URL
- `urls`: Array of additional URLs
- `purchaseAmount`: Purchase amount in wei

## Example Queries

### Get Recent Token Launches with Full Details

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

### Search by Token Name or Description

```graphql
{
  tokenLaunchSearch(
    text: "AI"  # Search in name and description
  ) {
    id
    name
    ticker
    description
    address
    tokenCreator
    timestamp
  }
}
```

### Get Launches with Core Types

```graphql
{
  tokenLaunches(
    where: {
      cores_contains: [1, 2]  # Launches with specific core types
    }
  ) {
    name
    ticker
    cores
    address
    tokenCreator
    timestamp
  }
}
```

### Get Launch Details by Transaction

```graphql
{
  tokenLaunch(id: "0x...") {  # Replace with transaction hash
    name
    ticker
    description
    imageUrl
    cores
    urls
    purchaseAmount
    address
    tokenCreator
    createdAtBlock
    timestamp
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
3. Update the mappings in `src/virtuals-protocol.ts`
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

- The subgraph starts indexing from block 21855685
- Combines data from both Launched events and launch function calls
- Addresses are stored both as strings (for search) and bytes (for raw data)
- Supports fulltext search on addresses, names, tickers, and descriptions
- Launch function parameters are captured and stored with the event data
