import { BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { Swap as SwapEvent } from "../generated/templates/VirtualsPair/VirtualsPair"
import { Swap, SwapData } from "../generated/schema"

function convertToDecimal(amount: BigInt): BigDecimal {
  return amount.toBigDecimal().div(BigDecimal.fromString("1000000000000000000")) // 18 decimals
}

export function handleSwap(event: SwapEvent): void {
  // Create legacy Swap entity
  const id = event.transaction.hash.toHexString()
  let swap = new Swap(id)

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

  // Create new SwapData timeseries entity
  // For timeseries entities with Int8 ID, we use a temporary ID that will be auto-incremented
  let swapData = new SwapData("0")
  
  // Convert amounts to decimals
  const amountToken = convertToDecimal(isSell ? event.params.amount0In : event.params.amount1In)
  const amountUSD = convertToDecimal(isSell ? event.params.amount1Out : event.params.amount0Out)

  swapData.token = event.address
  swapData.amountToken = amountToken
  swapData.amountUSD = amountUSD
  swapData.type = isSell ? "SELL" : "BUY"
  swapData.trader = event.transaction.from
  swapData.isBuy = isSell ? 0 : 1
  swapData.isSell = isSell ? 1 : 0
  swapData.traderCount = 1
  swapData.timestamp = event.block.timestamp.toI64()

  swapData.save()
}
