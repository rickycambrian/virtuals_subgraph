import { BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { Swap as SwapEvent } from "../generated/templates/VirtualsPair/VirtualsPair"
import { Swap } from "../generated/schema"

function convertToDecimal(amount: BigInt): BigDecimal {
  return amount.toBigDecimal().div(BigDecimal.fromString("1000000000000000000")) // 18 decimals
}

export function handleSwap(event: SwapEvent): void {
  // Create legacy Swap entity
  let swap = new Swap(event.transaction.hash)

  swap.timestamp = event.block.timestamp
  swap.block = event.block.number
  swap.trader = event.transaction.from

  // Determine if it's a buy or sell based on which amount is non-zero
  const isSell = event.params.amount0In.gt(BigInt.fromI32(0))
  swap.type = isSell ? "SELL" : "BUY"
  swap.amountIn = isSell ? event.params.amount0In : event.params.amount1In
  swap.amountOut = isSell ? event.params.amount1Out : event.params.amount0Out

  // These will be set by the Transfer event handler
  swap.tokenIn = event.address
  swap.tokenOut = event.address
  swap.feeAmount = BigInt.fromI32(0)
  swap.feeRecipient = event.address

  swap.save()

  // For now, commenting out SwapData handling until we can properly generate the entity
  // Will need to run codegen after schema changes are properly detected
}
