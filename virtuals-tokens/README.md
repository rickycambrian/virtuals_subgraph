# Virtuals Protocol Token Launch Subgraph

This subgraph indexes token launches from the Virtuals Protocol on Base network. It tracks successful transactions in the TransparentUpgradeableProxy function (0x3c0b93aa) at address `0xF66DeA7b3e897cD44A5a231c61B6B4423d613259`.

## Schema

The subgraph tracks the following data for each token launch:

- `address`: The address of the launched token (as string for searchability)
- `addressBytes`: The raw address bytes
- `createdAtBlock`: Block number when the token was created
- `createdAtTx`: Transaction hash of the creation
- `tokenCreator`: Address of the token creator (as string for searchability)
- `tokenCreatorBytes`: The raw creator address bytes
- `timestamp`: Timestamp of the creation

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
graph deploy --studio virtuals-tokens
```

When prompted for a version label, use semantic versioning (e.g., "0.1.0")

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
graph deploy --studio virtuals-tokens
```

## Testing

1. After deployment, you can test the subgraph by querying for token launches:

```graphql
{
  tokenLaunches(first: 5) {
    id
    address
    addressBytes
    createdAtBlock
    createdAtTx
    tokenCreator
    tokenCreatorBytes
    timestamp
  }
}
```

2. You can also use the fulltext search functionality:

```graphql
{
  tokenLaunchSearch(text: "0x...") {
    id
    address
    tokenCreator
  }
}
```

## Notes

- The subgraph starts indexing from block 21841737
- Only successful transactions are indexed
- Token addresses are extracted from the OwnershipTransferred event
- Addresses are stored both as strings (for search) and bytes (for raw data)
