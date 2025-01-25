import { BigDecimal, BigInt, Bytes, crypto, log } from "@graphprotocol/graph-ts"
import { TradeSnapshot, TokenDayStats, TokenSupply, TokenTraderStats } from "../generated/schema"

export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)
export const ZERO_BD = BigDecimal.fromString("0")
export const ONE_BD = BigDecimal.fromString("1")
export const BI_18 = BigInt.fromI32(18)
export const SECONDS_PER_DAY = 24 * 60 * 60

export function abs(num: BigDecimal): BigDecimal {
  return num.lt(ZERO_BD) ? num.times(BigDecimal.fromString("-1")) : num
}

export function max(a: BigDecimal, b: BigDecimal): BigDecimal {
  return a.gt(b) ? a : b
}

export function min(a: BigDecimal, b: BigDecimal): BigDecimal {
  return a.lt(b) ? a : b
}

export function convertToDecimal(amount: BigInt, decimals: BigInt = BI_18): BigDecimal {
  if (amount.isZero()) {
    return ZERO_BD
  }

  let bd = BigDecimal.fromString("1")
  for (let i = ZERO_BI; i.lt(decimals); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString("10"))
  }
  return amount.toBigDecimal().div(bd)
}

export function getDayStartTimestamp(timestamp: BigInt): BigInt {
  if (timestamp.lt(ZERO_BI)) {
    log.warning("Invalid timestamp: {}", [timestamp.toString()])
    return ZERO_BI
  }

  let dayIndex = timestamp.toI32() / SECONDS_PER_DAY
  return BigInt.fromI32(dayIndex * SECONDS_PER_DAY)
}

function toHexString(n: BigInt): string {
  if (n.equals(ZERO_BI)) {
    return "0".repeat(64)
  }
  
  const HEX_CHARS = '0123456789abcdef'
  let result = ''
  let value = n
  let length = 0
  
  // First pass: convert to hex and count length
  while (!value.equals(ZERO_BI)) {
    const remainder = value.mod(BigInt.fromI32(16)).toI32()
    result = HEX_CHARS.charAt(remainder) + result
    value = value.div(BigInt.fromI32(16))
    length++
  }
  
  // Second pass: pad with zeros
  let padded = ''
  for (let i = 0; i < 64 - length; i++) {
    padded += '0'
  }
  return padded + result
}

export function getTradeSnapshotID(token: Bytes, timestamp: BigInt, txHash: Bytes): Bytes {
  if (token.equals(Bytes.empty()) || txHash.equals(Bytes.empty())) {
    log.error("Invalid parameters for trade snapshot ID", [])
    return Bytes.empty()
  }

  let timestampHex = toHexString(timestamp)
  return Bytes.fromByteArray(
    crypto.keccak256(
      token
        .concat(Bytes.fromHexString(timestampHex))
        .concat(txHash)
    )
  )
}

export function getDayStatsID(token: Bytes, timestamp: BigInt, txHash: Bytes): Bytes {
  if (token.equals(Bytes.empty()) || txHash.equals(Bytes.empty())) {
    log.error("Invalid parameters for day stats ID", [])
    return Bytes.empty()
  }

  let dayStartTimestamp = getDayStartTimestamp(timestamp)
  let timestampHex = toHexString(dayStartTimestamp)
  return Bytes.fromByteArray(
    crypto.keccak256(
      token
        .concat(Bytes.fromHexString(timestampHex))
        .concat(txHash)
    )
  )
}

export function getTraderStatsID(token: Bytes, trader: Bytes, timestamp: BigInt): Bytes {
  if (token.equals(Bytes.empty()) || trader.equals(Bytes.empty())) {
    log.error("Invalid parameters for trader stats ID", [])
    return Bytes.empty()
  }

  let dayStartTimestamp = getDayStartTimestamp(timestamp)
  let timestampHex = toHexString(dayStartTimestamp)
  return Bytes.fromByteArray(
    crypto.keccak256(
      token
        .concat(trader)
        .concat(Bytes.fromHexString(timestampHex))
    )
  )
}

// Known USD-paired tokens
const USD_PAIRED_TOKENS = new Map<string, boolean>()
USD_PAIRED_TOKENS.set("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", true) // USDC
USD_PAIRED_TOKENS.set("0xdAC17F958D2ee523a2206206994597C13D831ec7", true) // USDT
USD_PAIRED_TOKENS.set("0x6B175474E89094C44Da98b954EedeAC495271d0F", true) // DAI

export function loadOrCreateTokenSupply(token: Bytes): TokenSupply | null {
  if (token.equals(Bytes.empty())) {
    log.warning("Invalid token address", [])
    return null
  }

  let supply = TokenSupply.load(token)
  if (!supply) {
    supply = new TokenSupply(token)
    supply.circulatingSupply = ZERO_BD
    supply.totalSupply = ZERO_BD
    supply.decimals = 18 // Default to 18, will be updated by ERC20 contract call
    supply.lastUpdateBlock = ZERO_BI
    supply.lastUpdateTimestamp = ZERO_BI
    supply.isUSDPair = USD_PAIRED_TOKENS.has(token.toHexString())
    supply.lastPriceUSD = ZERO_BD
    supply.lastPriceUpdateBlock = ZERO_BI
  }
  return supply
}

export function updateTokenPrice(
  token: Bytes,
  newPriceUSD: BigDecimal,
  blockNumber: BigInt
): void {
  let supply = loadOrCreateTokenSupply(token)
  if (!supply) {
    log.warning("Failed to load token supply for price update", [])
    return
  }

  // Only update if we have a valid price and it's a newer block
  if (newPriceUSD.gt(ZERO_BD) && blockNumber.gt(supply.lastPriceUpdateBlock)) {
    supply.lastPriceUSD = newPriceUSD
    supply.lastPriceUpdateBlock = blockNumber
    supply.save()
    log.info(
      "Updated price for token {} to {} USD at block {}",
      [token.toHexString(), newPriceUSD.toString(), blockNumber.toString()]
    )
  }
}

export function getTokenPriceUSD(
  token: Bytes,
  amount0: BigInt,
  amount1: BigInt,
  isAmount0In: boolean
): BigDecimal {
  let supply = loadOrCreateTokenSupply(token)
  if (!supply) {
    return ZERO_BD
  }

  // If this is a USD pair, calculate price directly
  if (supply.isUSDPair) {
    let tokenAmount = convertToDecimal(isAmount0In ? amount0 : amount1, BigInt.fromI32(supply.decimals))
    let usdAmount = convertToDecimal(isAmount0In ? amount1 : amount0, BigInt.fromI32(18)) // Assuming USD tokens use 18 decimals
    if (tokenAmount.equals(ZERO_BD)) {
      return ZERO_BD
    }
    return usdAmount.div(tokenAmount)
  }

  // Return last known price if available
  return supply.lastPriceUSD
}

export function createTokenDayStats(
  token: Bytes,
  timestamp: BigInt,
  txHash: Bytes,
  prevStats: TokenDayStats | null
): TokenDayStats {
  if (token.equals(Bytes.empty())) {
    log.warning("Invalid token address for day stats", [])
    token = Bytes.fromHexString("0x0000000000000000000000000000000000000000")
  }

  let dayID = getDayStatsID(token, timestamp, txHash)
  if (dayID.equals(Bytes.empty())) {
    log.warning("Invalid day stats ID generated", [])
    dayID = token // Fallback to using token address as ID
  }

  let dayStartTimestamp = getDayStartTimestamp(timestamp)
  let stats = new TokenDayStats(dayID)
  
  stats.token = token
  stats.date = dayStartTimestamp

  if (prevStats) {
    // Copy over cumulative metrics from previous stats
    stats.openPrice = prevStats.openPrice
    stats.highPrice = prevStats.highPrice
    stats.lowPrice = prevStats.lowPrice
    stats.volumeToken = prevStats.volumeToken
    stats.volumeUSD = prevStats.volumeUSD
    stats.txCount = prevStats.txCount
    stats.buyCount = prevStats.buyCount
    stats.sellCount = prevStats.sellCount
    stats.uniqueTraderCount = prevStats.uniqueTraderCount
    stats.marketCap = prevStats.marketCap
    stats.circulatingSupply = prevStats.circulatingSupply
    stats.largestTrade = prevStats.largestTrade
    stats.smallestTrade = prevStats.smallestTrade
    stats.largeTradeCount = prevStats.largeTradeCount
  } else {
    initializeDefaultStats(stats)
  }

  return stats
}

function initializeDefaultStats(stats: TokenDayStats): void {
  stats.openPrice = ZERO_BD
  stats.highPrice = ZERO_BD
  stats.lowPrice = ZERO_BD
  stats.volumeToken = ZERO_BD
  stats.volumeUSD = ZERO_BD
  stats.txCount = 0
  stats.buyCount = 0
  stats.sellCount = 0
  stats.uniqueTraderCount = 0
  stats.marketCap = ZERO_BD
  stats.circulatingSupply = ZERO_BD
  stats.largestTrade = ZERO_BD
  stats.smallestTrade = ZERO_BD
  stats.largeTradeCount = 0
  stats.closePrice = ZERO_BD
  stats.priceChange = ZERO_BD
  stats.volumeChange = ZERO_BD
  stats.averageTradeSize = ZERO_BD
  stats.volatility = ZERO_BD
  stats.buyRatio = ZERO_BD
  stats.averageHoldTime = ZERO_BI
  stats.traderRetention = ZERO_BD
  stats.priceVolatility = ZERO_BD
  stats.priceMovementCount = 0
  stats.longestPriceUptrend = 0
  stats.longestPriceDowntrend = 0
  stats.averagePriceImpact = ZERO_BD
  stats.volumeWeightedPrice = ZERO_BD
  stats.buyVolumeRatio = ZERO_BD
  stats.liquidityScore = ZERO_BD
  stats.marketEfficiency = ZERO_BD
  stats.buyPressure = ZERO_BD
  stats.marketDepth = ZERO_BD
  stats.peakTradingHour = 0
  stats.quietTradingHour = 0
}

export function loadOrCreateTokenTraderStats(
  token: Bytes,
  trader: Bytes,
  timestamp: BigInt
): TokenTraderStats | null {
  if (token.equals(Bytes.empty()) || trader.equals(Bytes.empty())) {
    log.warning("Invalid token or trader address", [])
    return null
  }

  let id = getTraderStatsID(token, trader, timestamp)
  if (id.equals(Bytes.empty())) {
    log.warning("Invalid trader stats ID generated", [])
    return null
  }

  let dayStartTimestamp = getDayStartTimestamp(timestamp)
  let stats = TokenTraderStats.load(id)

  if (!stats) {
    stats = new TokenTraderStats(id)
    stats.token = token
    stats.trader = trader
    stats.date = dayStartTimestamp
    stats.txCount = 0
    stats.volumeToken = ZERO_BD
    stats.volumeUSD = ZERO_BD
    stats.buyCount = 0
    stats.sellCount = 0
    stats.realizedPnL = ZERO_BD
    stats.averageEntryPrice = ZERO_BD
    stats.averageExitPrice = ZERO_BD
    stats.holdTime = ZERO_BI
    stats.tradeFrequency = ZERO_BD
    stats.profitabilityRatio = ZERO_BD
    stats.averagePositionSize = ZERO_BD
    stats.maxDrawdown = ZERO_BD
    stats.winningStreak = 0
    stats.losingStreak = 0
  }

  return stats
}

export function createTradeSnapshot(
  token: Bytes,
  timestamp: BigInt,
  txHash: Bytes,
  trader: Bytes,
  volumeToken: BigDecimal,
  volumeUSD: BigDecimal,
  priceUSD: BigDecimal,
  type: string,
  supply: TokenSupply
): TradeSnapshot {
  let id = getTradeSnapshotID(token, timestamp, txHash)
  if (id.equals(Bytes.empty())) {
    log.warning("Invalid trade snapshot ID generated", [])
    id = txHash // Fallback to using transaction hash as ID
  }
  
  let snapshot = new TradeSnapshot(id)
  snapshot.token = token
  snapshot.timestamp = timestamp
  snapshot.transaction = txHash
  snapshot.trader = trader
  snapshot.type = type
  snapshot.volumeToken = volumeToken
  snapshot.volumeUSD = volumeUSD
  snapshot.priceUSD = priceUSD
  snapshot.circulatingSupply = supply.circulatingSupply
  snapshot.marketCap = supply.circulatingSupply.times(priceUSD)
  
  return snapshot
}
