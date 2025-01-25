import { BigDecimal, BigInt, log, Address } from "@graphprotocol/graph-ts"
import { Swap as SwapEvent } from "../generated/templates/VirtualsPair/VirtualsPair"
import { VirtualsPair } from "../generated/templates/VirtualsPair/VirtualsPair"
import { ERC20 } from "../generated/templates/ERC20/ERC20"
import { Swap } from "../generated/schema"
import {
  convertTokenToDecimal,
  updateTokenDayData,
  ZERO_BD,
  ZERO_BI,
  exponentToBigDecimal
} from "./utils"

function getTokenDecimals(tokenAddress: Address): BigInt {
  const token = ERC20.bind(tokenAddress)
  const decimalsResult = token.try_decimals()
  return decimalsResult.reverted ? BigInt.fromI32(18) : BigInt.fromI32(decimalsResult.value)
}

export function handleSwap(event: SwapEvent): void {
  // Early validation
  if (!event.transaction || !event.block || !event.address) {
    return
  }

  // Create swap entity first to minimize memory usage
  const swap = new Swap(event.transaction.hash)
  swap.timestamp = event.block.timestamp
  swap.block = event.block.number
  swap.trader = event.transaction.from
  swap.feeAmount = ZERO_BI
  swap.feeRecipient = event.address

  // Determine swap type based on amounts
  const isSell = event.params.amount0In.gt(ZERO_BI) && event.params.amount1Out.gt(ZERO_BI)
  swap.type = isSell ? "SELL" : "BUY"

  // Load pair contract and get token addresses
  const pair = VirtualsPair.bind(event.address)
  const token0Result = pair.try_tokenA()
  const token1Result = pair.try_tokenB()

  if (token0Result.reverted || token1Result.reverted) {
    return
  }

  // Set token addresses and amounts
  if (isSell) {
    swap.tokenIn = token0Result.value
    swap.tokenOut = token1Result.value
    swap.amountIn = event.params.amount0In
    swap.amountOut = event.params.amount1Out
  } else {
    swap.tokenIn = token1Result.value
    swap.tokenOut = token0Result.value
    swap.amountIn = event.params.amount1In
    swap.amountOut = event.params.amount0Out
  }

  // Save basic swap data
  swap.save()

  // Calculate analytics values
  const decimalsIn = getTokenDecimals(Address.fromBytes(swap.tokenIn))
  const decimalsOut = getTokenDecimals(Address.fromBytes(swap.tokenOut))

  const amountToken = convertTokenToDecimal(swap.amountIn, decimalsIn)
  const amountUSD = convertTokenToDecimal(swap.amountOut, decimalsOut)

  if (!amountToken.equals(ZERO_BD) && !amountUSD.equals(ZERO_BD)) {
    const priceUSD = amountUSD.div(amountToken)
    updateTokenDayData(
      swap.tokenIn,
      event.block.timestamp,
      priceUSD,
      amountToken,
      amountUSD,
      swap.type,
      event.transaction.from
    )
  }
}
