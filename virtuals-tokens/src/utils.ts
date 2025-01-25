import { BigDecimal, BigInt, Bytes, crypto } from "@graphprotocol/graph-ts"
import { TradeSnapshot, TokenDayStats, TokenSupply, TokenTraderStats } from "../generated/schema"

export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)
export const ZERO_BD = BigDecimal.fromString("0")
export const ONE_BD = BigDecimal.fromString("1")
export const BI_18 = BigInt.fromI32(18)
export const SECONDS_PER_DAY = 24 * 60 * 60

export function convertToDecimal(amount: BigInt, decimals: BigInt = BI_18): BigDecimal {
  let bd = BigDecimal.fromString("1")
  for (let i = ZERO_BI; i.lt(decimals); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString("10"))
  }
  return amount.toBigDecimal().div(bd)
}

export function getDayStartTimestamp(timestamp: BigInt): BigInt {
  let dayIndex = timestamp.toI32() / SECONDS_PER_DAY
  return BigInt.fromI32(dayIndex * SECONDS_PER_DAY)
}

function toHexString(n: BigInt): string {
  if (n.equals(ZERO_BI)) return '0'
  
  const HEX_CHARS = '0123456789abcdef'
  let result = ''
  let value = n
  
  while (!value.equals(ZERO_BI)) {
    const remainder = value.mod(BigInt.fromI32(16)).toI32()
    result = HEX_CHARS.charAt(remainder) + result
    value = value.div(BigInt.fromI32(16))
  }
  
  // Pad to 64 characters
  let padded = ''
  for (let i = 0; i < 64 - result.length; i++) {
    padded += '0'
  }
  return padded + result
}

export function getTradeSnapshotID(token: Bytes, timestamp: BigInt, txHash: Bytes): Bytes {
  let timestampHex = toHexString(timestamp)
  return Bytes.fromByteArray(
    crypto.keccak256(
      token
        .concat(Bytes.fromHexString(timestampHex))
        .concat(txHash)
    )
  )
}

export function getDayStatsID(token: Bytes, timestamp: BigInt): Bytes {
  let dayStartTimestamp = getDayStartTimestamp(timestamp)
  let timestampHex = toHexString(dayStartTimestamp)
  return Bytes.fromByteArray(
    crypto.keccak256(
      token.concat(Bytes.fromHexString(timestampHex))
    )
  )
}

export function getTraderStatsID(token: Bytes, trader: Bytes, timestamp: BigInt): Bytes {
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

export function loadOrCreateTokenSupply(token: Bytes): TokenSupply {
  let supply = TokenSupply.load(token)
  if (!supply) {
    supply = new TokenSupply(token)
    supply.circulatingSupply = ZERO_BD
    supply.lastUpdateBlock = ZERO_BI
    supply.lastUpdateTimestamp = ZERO_BI
  }
  return supply
}

export function loadOrCreateTokenDayStats(token: Bytes, timestamp: BigInt): TokenDayStats {
  let dayID = getDayStatsID(token, timestamp)
  let dayStartTimestamp = getDayStartTimestamp(timestamp)
  let stats = TokenDayStats.load(dayID)

  if (!stats) {
    stats = new TokenDayStats(dayID)
    stats.token = token
    stats.date = dayStartTimestamp
    stats.openPrice = ZERO_BD
    stats.closePrice = ZERO_BD
    stats.highPrice = ZERO_BD
    stats.lowPrice = ZERO_BD
    stats.priceChange = ZERO_BD
    stats.volumeToken = ZERO_BD
    stats.volumeUSD = ZERO_BD
    stats.volumeChange = ZERO_BD
    stats.txCount = 0
    stats.buyCount = 0
    stats.sellCount = 0
    stats.uniqueTraderCount = 0
    stats.uniqueTraders = []
    stats.marketCap = ZERO_BD
    stats.circulatingSupply = ZERO_BD
    stats.averageTradeSize = ZERO_BD
    stats.largestTrade = ZERO_BD
    stats.smallestTrade = ZERO_BD
    stats.volatility = ZERO_BD
    stats.buyRatio = ZERO_BD
    stats.averageHoldTime = ZERO_BI
    stats.traderRetention = ZERO_BD
  }

  return stats
}

export function loadOrCreateTokenTraderStats(
  token: Bytes,
  trader: Bytes,
  timestamp: BigInt
): TokenTraderStats {
  let id = getTraderStatsID(token, trader, timestamp)
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
