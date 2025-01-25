import { BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts'
import { Swap } from '../../generated/templates/VirtualsPair/VirtualsPair'
import { 
  TokenEconomics, 
  EconomicSnapshot,
  Agent,
  Swap as SwapEntity
} from '../../generated/schema'

const ZERO_BD = BigDecimal.fromString('0')
const HUNDRED_BD = BigDecimal.fromString('100')
const DAY_IN_SECONDS = BigInt.fromI32(86400)

function abs(value: BigDecimal): BigDecimal {
  return value.lt(ZERO_BD) ? value.neg() : value
}

function getOrCreateTokenEconomics(tokenAddress: Address): TokenEconomics {
  let id = tokenAddress.toHexString().toLowerCase()
  let economics = TokenEconomics.load(id)
  
  if (!economics) {
    economics = new TokenEconomics(id)
    economics.token = tokenAddress
    economics.updateTimestamp = BigInt.fromI32(0)
    
    // Liquidity Metrics
    economics.liquidityDepth = ZERO_BD
    economics.liquidityUtilization = ZERO_BD
    
    // Velocity Metrics
    economics.tokenVelocity = ZERO_BD
    economics.holdingTimeAverage = BigInt.fromI32(0)
    
    // Distribution Metrics
    economics.rewardDistributionEfficiency = ZERO_BD
    economics.stakingYield = ZERO_BD
    economics.validatorYield = ZERO_BD
    
    // Pre-calculated Statistics
    economics.liquidityScore = ZERO_BD
    economics.marketEfficiency = ZERO_BD
    economics.volumeWeightedPrice = ZERO_BD
    
    // Time-series Metrics
    economics.hourlyVolumeAverage = ZERO_BD
    economics.dailyVolumeAverage = ZERO_BD
    economics.weeklyVolumeAverage = ZERO_BD
    
    // Running Totals
    economics.totalTransactions = BigInt.fromI32(0)
    economics.totalVolume = ZERO_BD
    economics.totalRewardsDistributed = ZERO_BD
    
    // Market Impact Metrics
    economics.priceStability = ZERO_BD
    economics.liquidityProviderConcentration = ZERO_BD
    economics.tradeImpactAverage = ZERO_BD
    economics.marketMaturityScore = ZERO_BD
    economics.stakingEfficiency = ZERO_BD

    economics.save()
  }
  
  return economics
}

function createEconomicSnapshot(
  token: Address,
  timestamp: BigInt,
  economics: TokenEconomics,
  triggerType: string,
  triggerAddress: Address
): void {
  let dayNumber = timestamp.div(DAY_IN_SECONDS).toI32()
  let id = token.toHexString().toLowerCase() + '-' + timestamp.toString()
  
  let snapshot = new EconomicSnapshot(id)
  
  // Required fields
  snapshot.token = token
  snapshot.timestamp = timestamp
  snapshot.dayNumber = dayNumber
  snapshot.priceUSD = economics.volumeWeightedPrice
  snapshot.liquidityDepth = economics.liquidityDepth
  snapshot.tokenVelocity = economics.tokenVelocity
  snapshot.rewardEfficiency = economics.rewardDistributionEfficiency
  snapshot.triggerType = triggerType
  snapshot.triggerAddress = triggerAddress
  
  // Initialize change percentages
  snapshot.priceChangePercent = ZERO_BD
  snapshot.liquidityChangePercent = ZERO_BD
  snapshot.velocityChangePercent = ZERO_BD
  
  // Initialize running totals
  snapshot.cumulativeVolume = economics.totalVolume
  snapshot.cumulativeRewards = economics.totalRewardsDistributed
  
  // Calculate changes from previous snapshot if it exists
  let prevDayId = token.toHexString().toLowerCase() + '-' + timestamp.minus(DAY_IN_SECONDS).toString()
  let prevSnapshot = EconomicSnapshot.load(prevDayId)
  
  if (prevSnapshot) {
    if (!prevSnapshot.priceUSD.equals(ZERO_BD)) {
      snapshot.priceChangePercent = economics.volumeWeightedPrice
        .minus(prevSnapshot.priceUSD)
        .div(prevSnapshot.priceUSD)
        .times(HUNDRED_BD)
    }
    
    if (!prevSnapshot.liquidityDepth.equals(ZERO_BD)) {
      snapshot.liquidityChangePercent = economics.liquidityDepth
        .minus(prevSnapshot.liquidityDepth)
        .div(prevSnapshot.liquidityDepth)
        .times(HUNDRED_BD)
    }
    
    if (!prevSnapshot.tokenVelocity.equals(ZERO_BD)) {
      snapshot.velocityChangePercent = economics.tokenVelocity
        .minus(prevSnapshot.tokenVelocity)
        .div(prevSnapshot.tokenVelocity)
        .times(HUNDRED_BD)
    }
  }
  
  snapshot.save()
}

export function handleSwap(event: Swap): void {
  let token = event.address
  let economics = getOrCreateTokenEconomics(token)
  
  // Update volume metrics
  let amount0In = event.params.amount0In.toBigDecimal()
  let amount1In = event.params.amount1In.toBigDecimal()
  let amount0Out = event.params.amount0Out.toBigDecimal()
  let amount1Out = event.params.amount1Out.toBigDecimal()
  
  // Determine which is the token amount (non-zero input)
  let volumeToken = amount0In.gt(ZERO_BD) ? amount0In : amount1In
  economics.totalVolume = economics.totalVolume.plus(volumeToken)
  economics.totalTransactions = economics.totalTransactions.plus(BigInt.fromI32(1))
  
  // Update price metrics (out/in ratio)
  let price = amount0In.gt(ZERO_BD) 
    ? amount1Out.div(amount0In)  // token0 in -> price in terms of token1
    : amount0Out.div(amount1In)  // token1 in -> price in terms of token0
  economics.volumeWeightedPrice = economics.volumeWeightedPrice.equals(ZERO_BD)
    ? price
    : economics.volumeWeightedPrice
        .times(economics.totalVolume.minus(volumeToken))
        .plus(price.times(volumeToken))
        .div(economics.totalVolume)
  
  // Calculate trade impact
  let priceImpact = abs(
    price
      .minus(economics.volumeWeightedPrice)
      .div(economics.volumeWeightedPrice)
  ).times(HUNDRED_BD)
  
  economics.tradeImpactAverage = economics.tradeImpactAverage.equals(ZERO_BD)
    ? priceImpact
    : economics.tradeImpactAverage
        .times(BigDecimal.fromString((economics.totalTransactions.minus(BigInt.fromI32(1))).toString()))
        .plus(priceImpact)
        .div(economics.totalTransactions.toBigDecimal())
  
  // Update market efficiency
  economics.marketEfficiency = HUNDRED_BD.minus(economics.tradeImpactAverage)
  
  // Update token velocity (volume/time)
  let timeSinceLastUpdate = event.block.timestamp.minus(economics.updateTimestamp)
  if (timeSinceLastUpdate.gt(BigInt.fromI32(0))) {
    economics.tokenVelocity = volumeToken.div(timeSinceLastUpdate.toBigDecimal())
  }
  
  economics.updateTimestamp = event.block.timestamp
  economics.save()
  
  // Create snapshot
  createEconomicSnapshot(
    token,
    event.block.timestamp,
    economics,
    'swap',
    event.transaction.from
  )
  
  // Create swap entity
  let swapEntity = new SwapEntity(event.transaction.hash)
  swapEntity.timestamp = event.block.timestamp
  swapEntity.block = event.block.number
  swapEntity.trader = event.transaction.from
  swapEntity.tokenIn = amount0In.gt(ZERO_BD) ? token : event.address
  swapEntity.tokenOut = amount0In.gt(ZERO_BD) ? event.address : token
  swapEntity.amountIn = BigInt.fromString(amount0In.gt(ZERO_BD) ? amount0In.toString() : amount1In.toString())
  swapEntity.amountOut = BigInt.fromString(amount0In.gt(ZERO_BD) ? amount1Out.toString() : amount0Out.toString())
  swapEntity.feeAmount = BigInt.fromI32(0)
  swapEntity.feeRecipient = event.address
  swapEntity.type = amount0In.gt(ZERO_BD) ? "SELL" : "BUY"
  swapEntity.save()

  // Update agent market metrics if this is an agent token
  let agent = Agent.load(token.toHexString().toLowerCase())
  if (agent) {
    agent.marketStability = HUNDRED_BD.minus(economics.tradeImpactAverage)
    agent.averageTradeImpact = economics.tradeImpactAverage
    agent.save()
  }
}
