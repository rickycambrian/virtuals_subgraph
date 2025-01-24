import { BigInt, log } from "@graphprotocol/graph-ts"
import { Swap as SwapEvent } from "../generated/templates/VirtualsPair/VirtualsPair"
import { Swap } from "../generated/schema"

export function handleSwap(event: SwapEvent): void {
  const id = event.transaction.hash.toHexString()
  let swap = new Swap(id)

  swap.timestamp = event.block.timestamp
  swap.block = event.block.number
  swap.trader = event.transaction.from

  // Determine if it's a buy or sell based on which amount is non-zero
  if (event.params.amount0In.gt(BigInt.fromI32(0))) {
    swap.type = "SELL"
    swap.amountIn = event.params.amount0In
    swap.amountOut = event.params.amount1Out
  } else {
    swap.type = "BUY"
    swap.amountIn = event.params.amount1In
    swap.amountOut = event.params.amount0Out
  }

  // These will be set by the Transfer event handler
  swap.tokenIn = event.address
  swap.tokenOut = event.address
  swap.feeAmount = BigInt.fromI32(0)
  swap.feeRecipient = event.address

  swap.save()
  
  log.info('Processed Swap event. ID: {}, Type: {}', [id, swap.type])
}
