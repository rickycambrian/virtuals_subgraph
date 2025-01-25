import { BigDecimal, BigInt, Bytes, log } from "@graphprotocol/graph-ts"
import { Swap as SwapEvent } from "../generated/templates/VirtualsPair/VirtualsPair"
import { Swap, TradeSnapshot, TokenDayStats, TokenTraderStats } from "../generated/schema"
import {
  ZERO_BI,
  ZERO_BD,
  ONE_BD,
  convertToDecimal,
  createTradeSnapshot,
  loadOrCreateTokenSupply,
  createTokenDayStats,
  loadOrCreateTokenTraderStats,
  getDayStartTimestamp,
  abs,
  max,
  min,
  getTokenPriceUSD,
  updateTokenPrice
} from "./utils"

export function handleSwap(event: SwapEvent): void {
  // Input validation
  if (event.params.amount0In.equals(ZERO_BI) && event.params.amount1In.equals(ZERO_BI)) {
    log.warning("Invalid swap amounts: both input amounts are zero", [])
    return
  }

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

  // Calculate token volume and price
  const volumeToken = convertToDecimal(isSell ? event.params.amount0In : event.params.amount1In)
  if (volumeToken.equals(ZERO_BD)) {
    log.warning("Volume token is zero, skipping price calculation", [])
    return
  }

  // Get USD price using our price calculation logic
  const priceUSD = getTokenPriceUSD(
    event.address,
    event.params.amount0In,
    event.params.amount1In,
    isSell
  )

  // Calculate USD volume based on actual price
  const volumeUSD = volumeToken.times(priceUSD)

  // Update token price if valid
  if (priceUSD.gt(ZERO_BD)) {
    updateTokenPrice(event.address, priceUSD, event.block.number)
  }

  // Load or create supply tracking
  let supply = loadOrCreateTokenSupply(event.address)
  if (!supply) {
    log.warning("Failed to load or create token supply for {}", [event.address.toHexString()])
    return
  }

  // Create and save trade snapshot with market cap calculation
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

  // Update market cap in trade snapshot
  if (priceUSD.gt(ZERO_BD) && supply.totalSupply.gt(ZERO_BD)) {
    tradeSnapshot.marketCap = supply.totalSupply.times(priceUSD)
  }
  
  tradeSnapshot.save()

  // Find previous day stats if they exist
  let dayStartTimestamp = getDayStartTimestamp(event.block.timestamp)
  let prevStats: TokenDayStats | null = null
  let allStats = TokenDayStats.load(event.address)
  if (allStats) {
    let stats = TokenDayStats.load(event.address)
    if (stats && stats.date.equals(dayStartTimestamp)) {
      prevStats = stats
    }
  }

  // Create new immutable day stats
  let dayStats = createTokenDayStats(
    event.address,
    event.block.timestamp,
    event.transaction.hash,
    prevStats
  )

  // Update price metrics
  if (!prevStats) {
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
  dayStats.uniqueTraderCount += 1

  // Update trade size metrics
  if (volumeToken.gt(dayStats.largestTrade)) {
    dayStats.largestTrade = volumeToken
  }
  if (dayStats.smallestTrade.equals(ZERO_BD) || volumeToken.lt(dayStats.smallestTrade)) {
    dayStats.smallestTrade = volumeToken
  }

  if (dayStats.txCount > 0) {
    dayStats.averageTradeSize = dayStats.volumeToken.div(BigDecimal.fromString(dayStats.txCount.toString()))
  }

  // Update ratios and changes
  if (dayStats.txCount > 0) {
    dayStats.buyRatio = BigDecimal.fromString(dayStats.buyCount.toString())
      .div(BigDecimal.fromString(dayStats.txCount.toString()))
  }
  
  if (!dayStats.openPrice.equals(ZERO_BD)) {
    dayStats.priceChange = priceUSD.minus(dayStats.openPrice)
      .div(dayStats.openPrice)
      .times(BigDecimal.fromString("100"))
  }

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
    if (dayStats.txCount > 0) {
      dayStats.averagePriceImpact = dayStats.averagePriceImpact
        .times(BigDecimal.fromString((dayStats.txCount - 1).toString()))
        .plus(priceChange)
        .div(BigDecimal.fromString(dayStats.txCount.toString()))
    }
    
    // Update VWAP
    if (!dayStats.volumeToken.equals(ZERO_BD)) {
      dayStats.volumeWeightedPrice = dayStats.volumeWeightedPrice
        .times(dayStats.volumeToken)
        .plus(priceUSD.times(volumeToken))
        .div(dayStats.volumeToken.plus(volumeToken))
    }
  }

  // Update volume analytics
  dayStats.buyVolumeRatio = dayStats.buyCount == 0 ? ZERO_BD :
    BigDecimal.fromString(dayStats.buyCount.toString())
      .div(BigDecimal.fromString(dayStats.txCount.toString()))

  if (volumeToken.gt(dayStats.averageTradeSize)) {
    dayStats.largeTradeCount += 1
  }

  // Update market health metrics
  if (!dayStats.averagePriceImpact.equals(ZERO_BD)) {
    dayStats.liquidityScore = ONE_BD.div(dayStats.averagePriceImpact)
  }
  if (!dayStats.priceVolatility.equals(ZERO_BD)) {
    dayStats.marketEfficiency = ONE_BD.div(dayStats.priceVolatility)
  }
  dayStats.buyPressure = dayStats.buyVolumeRatio.minus(BigDecimal.fromString("0.5"))
    .times(BigDecimal.fromString("2"))
  if (!dayStats.priceVolatility.equals(ZERO_BD)) {
    dayStats.marketDepth = dayStats.volumeToken.div(max(dayStats.priceVolatility, ONE_BD))
  }

  // Update peak trading hours
  let hour = event.block.timestamp.toI32() / 3600 % 24
  if (hour >= 0 && hour < 24) {
    if (volumeToken.gt(dayStats.volumeToken)) {
      dayStats.peakTradingHour = hour
    }
    if (dayStats.quietTradingHour == 0 || volumeToken.lt(dayStats.volumeToken)) {
      dayStats.quietTradingHour = hour
    }
  }

  // Update market metrics using total supply for market cap
  dayStats.circulatingSupply = supply.circulatingSupply
  if (priceUSD.gt(ZERO_BD) && supply.totalSupply.gt(ZERO_BD)) {
    dayStats.marketCap = supply.totalSupply.times(priceUSD)
  }

  dayStats.save()

  // Update trader stats
  let traderStats = loadOrCreateTokenTraderStats(event.address, event.transaction.from, event.block.timestamp)
  if (!traderStats) {
    log.warning("Failed to load or create trader stats", [])
    return
  }
  
  traderStats.txCount += 1
  traderStats.volumeToken = traderStats.volumeToken.plus(volumeToken)
  traderStats.volumeUSD = traderStats.volumeUSD.plus(volumeUSD)
  traderStats.buyCount += isSell ? 0 : 1
  traderStats.sellCount += isSell ? 1 : 0

  // Update trade frequency
  if (traderStats.txCount > 1) {
    let timeSinceLastTrade = event.block.timestamp.minus(traderStats.date)
    if (!timeSinceLastTrade.isZero()) {
      traderStats.tradeFrequency = traderStats.tradeFrequency
        .times(BigDecimal.fromString((traderStats.txCount - 1).toString()))
        .plus(convertToDecimal(timeSinceLastTrade))
        .div(BigDecimal.fromString(traderStats.txCount.toString()))
    }
  }

  // Update position metrics
  if (traderStats.txCount > 0) {
    traderStats.averagePositionSize = traderStats.volumeToken
      .div(BigDecimal.fromString(traderStats.txCount.toString()))
  }

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
      if (traderStats.txCount > 0) {
        let profitableTrades = traderStats.winningStreak
        traderStats.profitabilityRatio = BigDecimal.fromString(profitableTrades.toString())
          .div(BigDecimal.fromString(traderStats.txCount.toString()))
      }

      // Update max drawdown
      if (!traderStats.averageEntryPrice.equals(ZERO_BD)) {
        let drawdown = traderStats.averageEntryPrice.minus(priceUSD)
          .div(traderStats.averageEntryPrice)
          .times(BigDecimal.fromString("100"))
        if (drawdown.gt(traderStats.maxDrawdown)) {
          traderStats.maxDrawdown = drawdown
        }
      }
    }
  } else {
    traderStats.averageEntryPrice = priceUSD
  }

  traderStats.save()
}
