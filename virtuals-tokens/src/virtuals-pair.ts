import { BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { Swap as SwapEvent } from "../generated/templates/VirtualsPair/VirtualsPair"
import { Swap, TradeSnapshot, TokenDayStats, TokenTraderStats } from "../generated/schema"
import {
  ZERO_BI,
  ZERO_BD,
  convertToDecimal,
  createTradeSnapshot,
  loadOrCreateTokenSupply,
  loadOrCreateTokenDayStats,
  loadOrCreateTokenTraderStats
} from "./utils"

export function handleSwap(event: SwapEvent): void {
  // Create immutable Swap entity
  let swap = new Swap(event.transaction.hash)
  swap.timestamp = event.block.timestamp
  swap.block = event.block.number
  swap.trader = event.transaction.from

  // Determine if it's a buy or sell based on which amount is non-zero
  const isSell = event.params.amount0In.gt(ZERO_BI)
  const type = isSell ? "SELL" : "BUY"
  swap.type = type
  swap.amountIn = isSell ? event.params.amount0In : event.params.amount1In
  swap.amountOut = isSell ? event.params.amount1Out : event.params.amount0Out

  // These will be set by the Transfer event handler
  swap.tokenIn = event.address
  swap.tokenOut = event.address
  swap.feeAmount = ZERO_BI
  swap.feeRecipient = event.address

  swap.save()

  // Calculate amounts in decimals
  const volumeToken = convertToDecimal(isSell ? event.params.amount0In : event.params.amount1In)
  const volumeUSD = convertToDecimal(isSell ? event.params.amount1Out : event.params.amount0Out)
  const priceUSD = volumeUSD.div(volumeToken)

  // Load or create supply tracking
  let supply = loadOrCreateTokenSupply(event.address)

  // Create immutable trade snapshot
  let tradeSnapshot = createTradeSnapshot(
    event.address,
    event.block.timestamp,
    event.transaction.hash,
    event.transaction.from,
    volumeToken,
    volumeUSD,
    priceUSD,
    type,
    supply
  )
  tradeSnapshot.save()

  // Update mutable day stats
  let dayStats = loadOrCreateTokenDayStats(event.address, event.block.timestamp)
  
  // Update price metrics
  if (dayStats.txCount == 0) {
    dayStats.openPrice = priceUSD
  }
  dayStats.closePrice = priceUSD
  if (priceUSD.gt(dayStats.highPrice)) {
    dayStats.highPrice = priceUSD
  }
  if (dayStats.lowPrice.equals(ZERO_BD) || priceUSD.lt(dayStats.lowPrice)) {
    dayStats.lowPrice = priceUSD
  }

  // Update volume metrics
  dayStats.volumeToken = dayStats.volumeToken.plus(volumeToken)
  dayStats.volumeUSD = dayStats.volumeUSD.plus(volumeUSD)
  dayStats.txCount += 1
  dayStats.buyCount += isSell ? 0 : 1
  dayStats.sellCount += isSell ? 1 : 0

  // Update unique traders
  let traders = dayStats.uniqueTraders
  if (!traders.includes(event.transaction.from)) {
    traders.push(event.transaction.from)
    dayStats.uniqueTraderCount += 1
  }
  dayStats.uniqueTraders = traders

  // Update trade size metrics
  if (volumeToken.gt(dayStats.largestTrade)) {
    dayStats.largestTrade = volumeToken
  }
  if (dayStats.smallestTrade.equals(ZERO_BD) || volumeToken.lt(dayStats.smallestTrade)) {
    dayStats.smallestTrade = volumeToken
  }
  dayStats.averageTradeSize = dayStats.volumeToken.div(BigDecimal.fromString(dayStats.txCount.toString()))

  // Update ratios and changes
  dayStats.buyRatio = BigDecimal.fromString(dayStats.buyCount.toString())
    .div(BigDecimal.fromString(dayStats.txCount.toString()))
  dayStats.priceChange = priceUSD.minus(dayStats.openPrice).div(dayStats.openPrice).times(BigDecimal.fromString("100"))

  // Update market metrics
  dayStats.circulatingSupply = supply.circulatingSupply
  dayStats.marketCap = supply.circulatingSupply.times(priceUSD)

  dayStats.save()

  // Update mutable trader stats
  let traderStats = loadOrCreateTokenTraderStats(event.address, event.transaction.from, event.block.timestamp)
  
  traderStats.txCount += 1
  traderStats.volumeToken = traderStats.volumeToken.plus(volumeToken)
  traderStats.volumeUSD = traderStats.volumeUSD.plus(volumeUSD)
  traderStats.buyCount += isSell ? 0 : 1
  traderStats.sellCount += isSell ? 1 : 0

  if (isSell) {
    traderStats.averageExitPrice = priceUSD
    if (traderStats.holdTime.equals(ZERO_BI)) {
      traderStats.holdTime = event.block.timestamp.minus(traderStats.date)
    }
  } else {
    traderStats.averageEntryPrice = priceUSD
  }

  traderStats.save()
}
