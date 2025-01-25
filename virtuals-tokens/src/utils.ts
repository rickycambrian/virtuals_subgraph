import { BigDecimal, BigInt, Bytes, Address, log } from "@graphprotocol/graph-ts"
import { TokenDayData, TokenTraderDayData } from "../generated/schema"
import { ERC20 } from "../generated/templates/ERC20/ERC20"

export const ZERO_BD = BigDecimal.fromString('0')
export const ONE_BD = BigDecimal.fromString('1')
export const TEN_BD = BigDecimal.fromString('10')
export const HUNDRED_BD = BigDecimal.fromString('100')
export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)
export const BI_18 = BigInt.fromI32(18)
export const SECONDS_PER_DAY = BigInt.fromI32(86400)

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = ONE_BD
  for (let i = ZERO_BI; i.lt(decimals); i = i.plus(ONE_BI)) {
    bd = bd.times(TEN_BD)
  }
  return bd
}

export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

export function getDayNumber(timestamp: BigInt): BigInt {
  return timestamp.div(SECONDS_PER_DAY)
}

export function getDayStartTimestamp(timestamp: BigInt): BigInt {
  return getDayNumber(timestamp).times(SECONDS_PER_DAY)
}

export function getTokenDayID(token: Bytes, timestamp: BigInt): Bytes {
  const dayStartTimestamp = getDayStartTimestamp(timestamp)
  return token.concatI32(dayStartTimestamp.toI32())
}

export function updateTokenDayData(
  token: Bytes,
  timestamp: BigInt,
  priceUSD: BigDecimal,
  volumeToken: BigDecimal,
  volumeUSD: BigDecimal,
  type: string,
  trader: Bytes
): TokenDayData | null {
  if (!token || !timestamp) {
    log.warning('Missing required data for token day update: token={} timestamp={}', [
      token.toHexString(),
      timestamp.toString()
    ])
    return null
  }

  // Get day start timestamp
  const dayStartTimestamp = getDayStartTimestamp(timestamp)
  
  // Create ID using token address and day timestamp
  const id = getTokenDayID(token, timestamp)
  
  // Load or create token day data
  let tokenDayData = TokenDayData.load(id)
  if (!tokenDayData) {
    tokenDayData = new TokenDayData(id)
    tokenDayData.token = token
    tokenDayData.date = dayStartTimestamp
    tokenDayData.priceUSD = ZERO_BD
    tokenDayData.priceUSDHigh = ZERO_BD
    tokenDayData.priceUSDLow = ZERO_BD
    tokenDayData.priceUSDChange = ZERO_BD
    tokenDayData.volumeToken = ZERO_BD
    tokenDayData.volumeUSD = ZERO_BD
    tokenDayData.volumeUSDChange = ZERO_BD
    tokenDayData.txCount = 0
    tokenDayData.buyCount = 0
    tokenDayData.sellCount = 0
    tokenDayData.uniqueTraders = 0
    tokenDayData.marketCap = ZERO_BD
    tokenDayData.totalSupply = ZERO_BD
    tokenDayData.tvlUSD = ZERO_BD
    tokenDayData.liquidityUSD = ZERO_BD

    log.debug('Created new token day data: token={} date={}', [
      token.toHexString(),
      dayStartTimestamp.toString()
    ])
  }

  // Update price metrics
  tokenDayData.priceUSD = priceUSD
  if (priceUSD.gt(tokenDayData.priceUSDHigh)) {
    tokenDayData.priceUSDHigh = priceUSD
  }
  if (tokenDayData.priceUSDLow.equals(ZERO_BD) || priceUSD.lt(tokenDayData.priceUSDLow)) {
    tokenDayData.priceUSDLow = priceUSD
  }

  // Update volume metrics
  tokenDayData.volumeToken = tokenDayData.volumeToken.plus(volumeToken)
  tokenDayData.volumeUSD = tokenDayData.volumeUSD.plus(volumeUSD)

  // Update trade counts
  tokenDayData.txCount += 1
  if (type == "BUY") {
    tokenDayData.buyCount += 1
  } else {
    tokenDayData.sellCount += 1
  }

  // Update unique traders with minimal memory usage
  const dayTimestamp = getDayStartTimestamp(timestamp)
  const traderId = token.concatI32(dayTimestamp.toI32()).concat(trader)
  const traderDayData = TokenTraderDayData.load(traderId)
  
  if (!traderDayData) {
    tokenDayData.uniqueTraders += 1
    const newTraderDayData = new TokenTraderDayData(traderId)
    newTraderDayData.save()
  }

  // Update market metrics
  const tokenContract = ERC20.bind(Address.fromBytes(token))
  const totalSupplyResult = tokenContract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    const decimalsResult = tokenContract.try_decimals()
    const decimals = BigInt.fromI32(!decimalsResult.reverted ? decimalsResult.value : 18)
    const totalSupply = convertTokenToDecimal(totalSupplyResult.value, decimals)
    tokenDayData.totalSupply = totalSupply
    if (!priceUSD.equals(ZERO_BD)) {
      tokenDayData.marketCap = totalSupply.times(priceUSD)
    }

    log.debug('Updated market metrics: totalSupply={} marketCap={}', [
      totalSupply.toString(),
      tokenDayData.marketCap.toString()
    ])
  }

  // Calculate price change from previous day
  const previousDayTimestamp = dayStartTimestamp.minus(SECONDS_PER_DAY)
  const previousDayID = getTokenDayID(token, previousDayTimestamp)
  const previousDayData = TokenDayData.load(previousDayID)
  
  if (previousDayData && !previousDayData.priceUSD.equals(ZERO_BD)) {
    tokenDayData.priceUSDChange = priceUSD
      .minus(previousDayData.priceUSD)
      .div(previousDayData.priceUSD)
      .times(HUNDRED_BD)
    
    if (!previousDayData.volumeUSD.equals(ZERO_BD)) {
      tokenDayData.volumeUSDChange = volumeUSD
        .minus(previousDayData.volumeUSD)
        .div(previousDayData.volumeUSD)
        .times(HUNDRED_BD)
    }

    log.debug('Updated price changes: priceChange={} volumeChange={}', [
      tokenDayData.priceUSDChange.toString(),
      tokenDayData.volumeUSDChange.toString()
    ])
  }

  tokenDayData.save()
  return tokenDayData
}
