import { BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { Swap as SwapEvent } from "../generated/templates/VirtualsPair/VirtualsPair"
import { Swap, TradeSnapshot, TokenDayStats, TokenTraderStats } from "../generated/schema"
import {
  ZERO_BI,
  ZERO_BD,
  ONE_BD,
  convertToDecimal,
  createTradeSnapshot,
  loadOrCreateTokenSupply,
  loadOrCreateTokenDayStats,
  loadOrCreateTokenTraderStats,
  abs,
  max,
  min
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

  // Update price analytics
  if (dayStats.txCount > 1) {
    // Track price movements
    if (priceUSD.gt(dayStats.closePrice)) {
      if (dayStats.priceMovementCount == 0 || dayStats.closePrice.lt(dayStats.openPrice)) {
        dayStats.priceMovementCount += 1
      }
      dayStats.longestPriceUptrend += 1
      dayStats.longestPriceDowntrend = 0
    } else if (priceUSD.lt(dayStats.closePrice)) {
      if (dayStats.priceMovementCount == 0 || dayStats.closePrice.gt(dayStats.openPrice)) {
        dayStats.priceMovementCount += 1
      }
      dayStats.longestPriceDowntrend += 1
      dayStats.longestPriceUptrend = 0
    }

    // Calculate price impact and volatility
    let priceChange = abs(priceUSD.minus(dayStats.closePrice))
    dayStats.averagePriceImpact = dayStats.averagePriceImpact
      .times(BigDecimal.fromString((dayStats.txCount - 1).toString()))
      .plus(priceChange)
      .div(BigDecimal.fromString(dayStats.txCount.toString()))
    
    // Update VWAP
    dayStats.volumeWeightedPrice = dayStats.volumeWeightedPrice
      .times(dayStats.volumeToken)
      .plus(priceUSD.times(volumeToken))
      .div(dayStats.volumeToken.plus(volumeToken))
  }

  // Update volume analytics
  dayStats.buyVolumeRatio = dayStats.buyCount == 0 ? ZERO_BD :
    BigDecimal.fromString(dayStats.buyCount.toString())
      .div(BigDecimal.fromString(dayStats.txCount.toString()))

  if (volumeToken.gt(dayStats.averageTradeSize)) {
    dayStats.largeTradeCount += 1
  }

  // Update market health metrics
  dayStats.liquidityScore = dayStats.averagePriceImpact.equals(ZERO_BD) ? ZERO_BD :
    ONE_BD.div(dayStats.averagePriceImpact)
  dayStats.marketEfficiency = dayStats.priceVolatility.equals(ZERO_BD) ? ONE_BD :
    ONE_BD.div(dayStats.priceVolatility)
  dayStats.buyPressure = dayStats.buyVolumeRatio.minus(BigDecimal.fromString("0.5")).times(BigDecimal.fromString("2"))
  dayStats.marketDepth = dayStats.volumeToken.div(max(dayStats.priceVolatility, ONE_BD))

  // Update time-based analytics
  let hour = event.block.timestamp.toI32() / 3600 % 24
  let hourlyVolume = dayStats.hourlyVolume
  let hourlyTrades = dayStats.hourlyTrades

  // Initialize arrays if they're empty
  if (hourlyVolume.length == 0) {
    for (let i = 0; i < 24; i++) {
      hourlyVolume.push(ZERO_BD)
      hourlyTrades.push(0)
    }
  }

  // Safely update the arrays
  if (hour < hourlyVolume.length) {
    hourlyVolume[hour] = hourlyVolume[hour].plus(volumeToken)
    hourlyTrades[hour] = hourlyTrades[hour] + 1
  }
  dayStats.hourlyVolume = hourlyVolume
  dayStats.hourlyTrades = hourlyTrades

  // Find peak and quiet hours
  let maxVolume = ZERO_BD
  let minVolume = hourlyVolume.length > 0 ? hourlyVolume[0] : ZERO_BD

  for (let i = 0; i < hourlyVolume.length; i++) {
    if (hourlyVolume[i].gt(maxVolume)) {
      maxVolume = hourlyVolume[i]
      dayStats.peakTradingHour = i
    }
    if (hourlyVolume[i].lt(minVolume)) {
      minVolume = hourlyVolume[i]
      dayStats.quietTradingHour = i
    }
  }

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

  // Update trade frequency
  if (traderStats.txCount > 1) {
    let timeSinceLastTrade = event.block.timestamp.minus(traderStats.date)
    traderStats.tradeFrequency = traderStats.tradeFrequency
      .times(BigDecimal.fromString((traderStats.txCount - 1).toString()))
      .plus(convertToDecimal(timeSinceLastTrade))
      .div(BigDecimal.fromString(traderStats.txCount.toString()))
  }

  // Update position metrics
  traderStats.averagePositionSize = traderStats.volumeToken
    .div(BigDecimal.fromString(traderStats.txCount.toString()))

  if (isSell) {
    traderStats.averageExitPrice = priceUSD
    if (traderStats.holdTime.equals(ZERO_BI)) {
      traderStats.holdTime = event.block.timestamp.minus(traderStats.date)
    }

    // Calculate PnL and update streaks
    if (traderStats.averageEntryPrice.gt(ZERO_BD)) {
      let pnl = priceUSD.minus(traderStats.averageEntryPrice)
      traderStats.realizedPnL = traderStats.realizedPnL.plus(pnl.times(volumeToken))
      
      if (pnl.gt(ZERO_BD)) {
        traderStats.winningStreak += 1
        traderStats.losingStreak = 0
      } else {
        traderStats.winningStreak = 0
        traderStats.losingStreak += 1
      }

      // Update profitability ratio
      let profitableTrades = traderStats.winningStreak
      traderStats.profitabilityRatio = BigDecimal.fromString(profitableTrades.toString())
        .div(BigDecimal.fromString(traderStats.txCount.toString()))

      // Update max drawdown
      let drawdown = traderStats.averageEntryPrice.minus(priceUSD)
        .div(traderStats.averageEntryPrice)
        .times(BigDecimal.fromString("100"))
      if (drawdown.gt(traderStats.maxDrawdown)) {
        traderStats.maxDrawdown = drawdown
      }
    }
  } else {
    traderStats.averageEntryPrice = priceUSD
  }

  traderStats.save()
}
