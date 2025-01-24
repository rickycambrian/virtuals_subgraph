import { BigInt, BigDecimal, log, dataSource } from "@graphprotocol/graph-ts"
import { updateMetricsFromSwap, ZERO_BI } from "./utils"
import { Swap as SwapEvent } from "../generated/templates/PairTemplate/Pair"
import { TradeEvent } from "../generated/schema"

export function handleSwap(event: SwapEvent): void {
  let id = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.logIndex.toString())

  let trade = new TradeEvent(id)
  trade.transactionHash = event.transaction.hash
  trade.blockNumber = event.block.number
  trade.timestamp = event.block.timestamp
  trade.eventType = "Swap"
  
  trade.tokenAddress = event.address.toHexString()
  trade.tokenAddressBytes = event.address
  
  // Get context data
  let context = dataSource.context()
  let tokenAddress = context.getString("token")
  
  // For Swap events, we store the detailed amounts
  trade.amount0In = event.params.amount0In
  trade.amount0Out = event.params.amount0Out
  trade.amount1In = event.params.amount1In
  trade.amount1Out = event.params.amount1Out
  
  // Set the main amountIn/Out fields for consistency
  if (event.params.amount0In.gt(BigInt.fromI32(0))) {
    trade.amountIn = event.params.amount0In
  } else {
    trade.amountIn = event.params.amount1In
  }
  
  if (event.params.amount0Out.gt(BigInt.fromI32(0))) {
    trade.amountOut = event.params.amount0Out
  } else {
    trade.amountOut = event.params.amount1Out
  }
  
  trade.save()
  
  // Update daily metrics
  // Note: This is a simplified USD calculation, you may want to use an oracle
  let amountUSD = BigDecimal.fromString("1") // Replace with actual price calculation
  // Set a default value for amountIn if it's null
  let amountToUse = event.params.amount0In.gt(BigInt.fromI32(0)) ? 
    event.params.amount0In : event.params.amount1In
  
  updateMetricsFromSwap(
    event.block.timestamp,
    tokenAddress,
    event.address,
    amountToUse,
    amountUSD
  )
  
  log.info('Successfully saved Swap TradeEvent with ID: {} for token {}', [id, tokenAddress])
}
