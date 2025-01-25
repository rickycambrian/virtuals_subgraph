import { BigInt, log } from "@graphprotocol/graph-ts"
import { 
  Transfer as TransferEvent,
  ERC20
} from "../generated/templates/ERC20/ERC20"
import { Swap } from "../generated/schema"
import { loadOrCreateTokenSupply, convertToDecimal, ZERO_BI } from "./utils"

const FEE_RECIPIENT = "0x9883A9f1284A1F0187401195DC1309F6cC167147"
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

export function handleTransfer(event: TransferEvent): void {
  let swap = Swap.load(event.transaction.hash)
  let token = event.address

  // Update token supply tracking
  let supply = loadOrCreateTokenSupply(token)
  if (!supply) {
    log.warning('Failed to load or create token supply for token: {}', [token.toHexString()])
    return
  }

  // If this is the first transfer, initialize token data
  if (supply.decimals == 18) { // Default value indicates uninitialized
    let erc20 = ERC20.bind(token)
    
    // Get decimals - call will return 0 if it fails
    let decimalsResult = erc20.decimals()
    if (decimalsResult > 0) {
      supply.decimals = decimalsResult
      log.info('Updated decimals for token: {} to {}', [
        token.toHexString(),
        decimalsResult.toString()
      ])
    } else {
      log.warning('Failed to get decimals for token: {}', [token.toHexString()])
    }

    // Get total supply - call will return 0 if it fails
    let totalSupplyResult = erc20.totalSupply()
    if (totalSupplyResult.gt(ZERO_BI)) {
      supply.totalSupply = convertToDecimal(totalSupplyResult, BigInt.fromI32(supply.decimals))
      log.info('Updated total supply for token: {} to {}', [
        token.toHexString(),
        supply.totalSupply.toString()
      ])
    } else {
      log.warning('Failed to get total supply for token: {}', [token.toHexString()])
    }
  }

  let currentSupply = convertToDecimal(event.params.value, BigInt.fromI32(supply.decimals))

  if (event.params.from.toHexString() == ZERO_ADDRESS) {
    // Mint: increase both supplies
    supply.circulatingSupply = supply.circulatingSupply.plus(currentSupply)
    supply.totalSupply = supply.totalSupply.plus(currentSupply)
  } else if (event.params.to.toHexString() == ZERO_ADDRESS) {
    // Burn: decrease both supplies
    supply.circulatingSupply = supply.circulatingSupply.minus(currentSupply)
    supply.totalSupply = supply.totalSupply.minus(currentSupply)
  } else {
    // Regular transfer: only update circulating supply if needed
    // For example, if transferring to/from a known excluded address
    // like a treasury or vesting contract
  }

  supply.lastUpdateBlock = event.block.number
  supply.lastUpdateTimestamp = event.block.timestamp
  supply.save()

  // Handle swap-related transfer
  if (swap) {
    // If this is a fee transfer (to the fee recipient)
    if (event.params.to.toHexString() == FEE_RECIPIENT) {
      swap.feeAmount = event.params.value
      swap.feeRecipient = event.params.to
    } 
    // If this is the main token transfer
    else if (event.params.from.toHexString() != FEE_RECIPIENT && event.params.to.toHexString() != FEE_RECIPIENT) {
      // For sells, the token being sold is transferred first
      if (swap.tokenIn.equals(event.address)) {
        swap.tokenIn = event.params.from
        swap.tokenOut = event.params.to
      }
    }

    swap.save()
    log.info('Updated Swap entity with Transfer info. ID: {}', [event.transaction.hash.toHexString()])
  }
}
