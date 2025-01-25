import { BigInt, BigDecimal, Bytes, ethereum } from '@graphprotocol/graph-ts'
import {
  Agent,
  Validator,
  Contribution,
  Service,
  AgentDayData,
  MaturityScoreSnapshot,
  TokenEconomics,
  EconomicSnapshot,
  RankSnapshot,
  CoreTypeRank,
  GraduationMarketImpact,
  NetworkMetrics,
  GraduationPrediction,
  ValidatorNetwork,
  MarketHealthSnapshot
} from '../../generated/schema'
import {
  AgentCreated,
  AgentGraduated,
  ValidatorAdded,
  ValidatorScoreUpdated,
  ContributionSubmitted,
  ServiceAccepted,
  StakeUpdated,
  RewardDistributed
} from '../../generated/AgentNft/AgentNft'

const ZERO_BI = BigInt.fromI32(0)
const ONE_BI = BigInt.fromI32(1)
const ZERO_BD = BigDecimal.fromString('0')
const HUNDRED_BD = BigDecimal.fromString('100')

function sqrt(value: BigDecimal): BigDecimal {
  if (value.lt(ZERO_BD)) {
    return ZERO_BD
  }
  
  let n = value.truncate(0)
  if (n.equals(ZERO_BD)) {
    return ZERO_BD
  }
  
  let x = BigDecimal.fromString(n.toString())
  let y = value.div(x).plus(x).div(BigDecimal.fromString('2'))
  
  while (y.lt(x)) {
    x = y
    y = value.div(x).plus(x).div(BigDecimal.fromString('2'))
  }
  
  return x
}

function calculateMarketHealthScore(agent: Agent): BigDecimal {
  let priceStabilityWeight = BigDecimal.fromString('0.3')
  let liquidityDepthWeight = BigDecimal.fromString('0.2')
  let validatorParticipationWeight = BigDecimal.fromString('0.2')
  let stakingEfficiencyWeight = BigDecimal.fromString('0.15')
  let serviceSuccessWeight = BigDecimal.fromString('0.15')

  let priceStability = agent.marketStability
  let liquidityDepth = agent.liquidityProviderCount.toBigDecimal()
  let validatorParticipation = agent.activeValidatorCount.toBigDecimal().div(agent.validatorCount.toBigDecimal())
  let stakingEfficiency = agent.stakingAPY.div(HUNDRED_BD)
  let serviceSuccess = agent.serviceSuccessRate.div(HUNDRED_BD)

  return priceStability.times(priceStabilityWeight)
    .plus(liquidityDepth.times(liquidityDepthWeight))
    .plus(validatorParticipation.times(validatorParticipationWeight))
    .plus(stakingEfficiency.times(stakingEfficiencyWeight))
    .plus(serviceSuccess.times(serviceSuccessWeight))
}

function calculateNetworkGrowthContribution(agent: Agent): BigDecimal {
  let stakingWeight = BigDecimal.fromString('0.4')
  let validatorWeight = BigDecimal.fromString('0.3')
  let serviceWeight = BigDecimal.fromString('0.3')

  let stakingGrowth = agent.stakingGrowthRate.div(HUNDRED_BD)
  let validatorGrowth = agent.validatorCount.toBigDecimal().div(BigDecimal.fromString('100'))
  let serviceGrowth = agent.serviceCount.toBigDecimal().div(BigDecimal.fromString('100'))

  return stakingGrowth.times(stakingWeight)
    .plus(validatorGrowth.times(validatorWeight))
    .plus(serviceGrowth.times(serviceWeight))
}

function predictGraduation(agent: Agent): GraduationPrediction {
  let id = agent.id.toString() + '-' + agent.lastRankUpdate.toString()
  let prediction = new GraduationPrediction(id)
  prediction.agent = agent.id
  prediction.networkMetrics = agent.id
  
  let timeSinceCreation = agent.lastRankUpdate.minus(agent.createdAt)
  let progressRate = agent.graduationProgress.div(timeSinceCreation.toBigDecimal())
  
  let remainingProgress = HUNDRED_BD.minus(agent.graduationProgress)
  let estimatedRemainingTime = remainingProgress.div(progressRate)
  
  prediction.predictedGraduationTimestamp = agent.lastRankUpdate.plus(
    BigInt.fromString(estimatedRemainingTime.truncate(0).toString())
  )
  
  let confidenceFactors = [
    agent.serviceSuccessRate.div(HUNDRED_BD),
    agent.validatorSuccessRate.div(HUNDRED_BD),
    agent.stakingGrowthRate.gt(ZERO_BD) ? BigDecimal.fromString('1') : ZERO_BD
  ]
  
  let confidenceScore = ZERO_BD
  for (let i = 0; i < confidenceFactors.length; i++) {
    confidenceScore = confidenceScore.plus(confidenceFactors[i])
  }
  confidenceScore = confidenceScore.div(BigDecimal.fromString(confidenceFactors.length.toString()))
  
  prediction.confidenceScore = confidenceScore
  prediction.currentProgress = agent.graduationProgress
  prediction.progressRate = progressRate
  prediction.factorsContributing = [
    'Service Success Rate: ' + agent.serviceSuccessRate.toString(),
    'Validator Success Rate: ' + agent.validatorSuccessRate.toString(),
    'Staking Growth Rate: ' + agent.stakingGrowthRate.toString()
  ]
  
  return prediction
}

function updateValidatorNetwork(validator: Validator, event: ethereum.Event): void {
  let network = ValidatorNetwork.load(validator.id)
  if (!network) {
    network = new ValidatorNetwork(validator.id)
    network.validator = validator.id
    network.crossAgentValidations = 0
    network.uniqueAgentsValidated = 0
    network.specialization = []
    network.validationSuccessRate = ZERO_BD
    network.averageValidationImpact = ZERO_BD
    network.networkInfluenceScore = ZERO_BD
  }
  
  network.crossAgentValidations += 1
  
  if (validator.validationCount.gt(ZERO_BI)) {
    network.validationSuccessRate = validator.score
      .toBigDecimal()
      .div(validator.validationCount.toBigDecimal())
      .times(HUNDRED_BD)
  }
  
  let agent = Agent.load(validator.agent)
  if (agent && agent.validatorCount.gt(ZERO_BI)) {
    network.networkInfluenceScore = validator.validationCount
      .toBigDecimal()
      .div(agent.validatorCount.toBigDecimal())
      .times(HUNDRED_BD)
  }
  
  network.lastUpdated = event.block.timestamp
  network.save()
}

function createMarketHealthSnapshot(agent: Agent, event: ethereum.Event): void {
  let snapshot = new MarketHealthSnapshot(
    agent.id.toString() + '-' + event.block.timestamp.toString()
  )
  
  snapshot.timestamp = event.block.timestamp
  snapshot.agent = agent.id
  
  snapshot.priceStability = agent.marketStability
  snapshot.liquidityDepth = agent.liquidityProviderCount.toBigDecimal()
  snapshot.validatorParticipation = agent.activeValidatorCount
    .toBigDecimal()
    .div(agent.validatorCount.toBigDecimal())
    .times(HUNDRED_BD)
  snapshot.stakingEfficiency = agent.stakingAPY
  snapshot.serviceSuccessRate = agent.serviceSuccessRate
  
  snapshot.overallHealthScore = calculateMarketHealthScore(agent)
  snapshot.marketMaturityScore = agent.graduationProgress
  snapshot.networkEffectScore = calculateNetworkGrowthContribution(agent)
  
  let economics = TokenEconomics.load(agent.token.toHexString())
  if (economics) {
    snapshot.volumeWeightedPrice = economics.volumeWeightedPrice
    snapshot.largeTradeImpact = economics.tradeImpactAverage
    snapshot.buyPressure = economics.tokenVelocity
    snapshot.sellPressure = ZERO_BD
  }
  
  snapshot.save()
}

function updateNetworkMetrics(event: ethereum.Event): void {
  let id = event.block.timestamp.div(BigInt.fromI32(86400)).toString()
  let metrics = NetworkMetrics.load(id)
  if (!metrics) {
    metrics = new NetworkMetrics(id)
    metrics.newAgentsCount = 0
    metrics.newValidatorsCount = 0
    metrics.newServicesCount = 0
    metrics.networkGrowthRate = ZERO_BD
    metrics.marketHealthScore = ZERO_BD
    metrics.validatorParticipationRate = ZERO_BD
    metrics.averageValidationFrequency = ZERO_BD
    metrics.totalVolumeUSD = ZERO_BD
    metrics.volumeWeightedPrice = ZERO_BD
    metrics.buyPressure = ZERO_BD
    metrics.sellPressure = ZERO_BD
    metrics.averageGraduationTime = ZERO_BI
  }
  
  metrics.timestamp = event.block.timestamp
  
  let eventName = event.transaction.input.toString().slice(0, 10)
  if (eventName == '0x3c797536') {
    metrics.newAgentsCount += 1
  } else if (eventName == '0x4d99dd16') {
    metrics.newValidatorsCount += 1
  } else if (eventName == '0x7f4ab1dd') {
    metrics.newServicesCount += 1
  }
  
  let prevMetrics = NetworkMetrics.load(
    event.block.timestamp.minus(BigInt.fromI32(86400)).div(BigInt.fromI32(86400)).toString()
  )
  if (prevMetrics) {
    let totalPrev = prevMetrics.newAgentsCount + prevMetrics.newValidatorsCount + prevMetrics.newServicesCount
    let totalCurrent = metrics.newAgentsCount + metrics.newValidatorsCount + metrics.newServicesCount
    
    if (totalPrev > 0) {
      metrics.networkGrowthRate = BigDecimal.fromString((totalCurrent - totalPrev).toString())
        .div(BigDecimal.fromString(totalPrev.toString()))
        .times(HUNDRED_BD)
    }
  }
  
  metrics.save()
}

export function handleAgentCreated(event: AgentCreated): void {
  let agent = new Agent(event.params.virtualId.toString())
  agent.virtualId = event.params.virtualId
  agent.founder = event.params.founder
  agent.dao = event.params.dao
  agent.token = event.params.token
  agent.tba = event.params.tba
  agent.coreTypes = event.params.coreTypes
  agent.createdAt = event.block.timestamp
  agent.maturityScore = ZERO_BI
  agent.graduatedToUniswap = false
  agent.graduationTimestamp = null
  agent.totalStaked = ZERO_BD
  agent.uniqueStakers = ZERO_BI
  agent.stakingRewardsDistributed = ZERO_BD
  agent.graduationProgress = ZERO_BD
  agent.serviceSuccessRate = ZERO_BD
  agent.performanceRank = ZERO_BI
  agent.lastRankUpdate = event.block.timestamp
  agent.servicesArray = []
  agent.averageStakeDuration = ZERO_BI
  agent.stakingAPY = ZERO_BD
  agent.validatorCount = ZERO_BI
  agent.activeValidatorCount = ZERO_BI
  agent.totalServiceImpact = ZERO_BD
  agent.averageServiceImpact = ZERO_BD
  agent.lastServiceTimestamp = event.block.timestamp
  agent.contributionAcceptanceRate = ZERO_BD
  agent.hourlyStakingYield = ZERO_BD
  agent.dailyStakingYield = ZERO_BD
  agent.weeklyStakingYield = ZERO_BD
  agent.monthlyStakingYield = ZERO_BD
  agent.serviceCount = ZERO_BI
  agent.successfulServiceCount = ZERO_BI
  agent.failedServiceCount = ZERO_BI
  agent.averageServiceMaturityScore = ZERO_BD
  agent.averageValidatorScore = ZERO_BD
  agent.validatorSuccessRate = ZERO_BD
  agent.totalValidations = ZERO_BI
  agent.minStakeAmount = ZERO_BD
  agent.maxStakeAmount = ZERO_BD
  agent.medianStakeAmount = ZERO_BD
  agent.stakingGrowthRate = ZERO_BD
  agent.timeWeightedStake = ZERO_BD
  agent.timeWeightedImpact = ZERO_BD
  agent.stakeDistributionP25 = ZERO_BD
  agent.stakeDistributionP50 = ZERO_BD
  agent.stakeDistributionP75 = ZERO_BD
  agent.stakeDistributionStdDev = ZERO_BD
  agent.priceImpactScore = ZERO_BD
  agent.marketStability = ZERO_BD
  agent.liquidityProviderCount = ZERO_BI
  agent.averageTradeImpact = ZERO_BD
  agent.impactRank = ZERO_BI
  agent.stakeRank = ZERO_BI
  agent.rewardRank = ZERO_BI
  agent.validatorRank = ZERO_BI
  agent.marketHealthScore = ZERO_BD
  agent.networkGrowthContribution = ZERO_BD
  agent.predictedGraduationTimestamp = null
  agent.graduationConfidence = ZERO_BD
  
  agent.save()
  
  createMarketHealthSnapshot(agent, event)
  updateNetworkMetrics(event)
}

export function handleValidatorAdded(event: ValidatorAdded): void {
  let validatorID = event.params.virtualId.toString() + '-' + event.params.validator.toHexString()
  let validator = new Validator(validatorID)
  validator.agent = event.params.virtualId.toString()
  validator.address = event.params.validator
  validator.score = ZERO_BI
  validator.totalRewardsEarned = ZERO_BD
  validator.validationCount = ZERO_BI
  validator.lastActiveTimestamp = event.block.timestamp
  validator.crossAgentPerformance = ZERO_BD
  validator.specializationScore = ZERO_BD
  
  validator.save()
  
  updateValidatorNetwork(validator, event)
  updateNetworkMetrics(event)
}

export function handleValidatorScoreUpdated(event: ValidatorScoreUpdated): void {
  let validatorID = event.params.virtualId.toString() + '-' + event.params.validator.toHexString()
  let validator = Validator.load(validatorID)
  if (validator) {
    validator.score = event.params.newScore
    validator.lastActiveTimestamp = event.block.timestamp
    validator.validationCount = validator.validationCount.plus(ONE_BI)
    validator.save()
    
    updateValidatorNetwork(validator, event)
  }
}

export function handleServiceAccepted(event: ServiceAccepted): void {
  let serviceID = event.params.serviceId.toString()
  let contributionID = event.params.contributionId.toString()
  let agentID = event.params.virtualId.toString()
  
  let agent = Agent.load(agentID)
  if (agent) {
    let service = new Service(serviceID)
    service.agent = agentID
    service.contribution = contributionID
    service.maturityScore = event.params.maturityScore
    service.impact = event.params.impact.toBigDecimal()
    service.coreType = event.params.coreType
    service.timestamp = event.block.timestamp
    service.rewardsGenerated = ZERO_BD
    service.priceImpact = event.params.impact.toBigDecimal().div(HUNDRED_BD)
    service.rewardEfficiency = ZERO_BD
    service.liquidityEffect = ZERO_BD
    service.token = agent.token
    service.save()
    
    agent.totalServiceImpact = agent.totalServiceImpact.plus(service.impact)
    agent.lastServiceTimestamp = event.block.timestamp
    agent.serviceCount = agent.serviceCount.plus(ONE_BI)
    
    if (service.impact.gt(ZERO_BD)) {
      agent.successfulServiceCount = agent.successfulServiceCount.plus(ONE_BI)
    } else {
      agent.failedServiceCount = agent.failedServiceCount.plus(ONE_BI)
    }
    
    let totalServices = BigInt.fromI32(agent.servicesArray.length)
    if (totalServices.gt(ZERO_BI)) {
      agent.averageServiceImpact = agent.totalServiceImpact.div(totalServices.toBigDecimal())
      agent.averageServiceMaturityScore = BigDecimal.fromString(agent.maturityScore.toString())
        .div(totalServices.toBigDecimal())
    }
    
    let services = agent.servicesArray
    services.push(serviceID)
    agent.servicesArray = services
    
    if (agent.serviceCount.gt(ZERO_BI)) {
      agent.serviceSuccessRate = agent.successfulServiceCount
        .toBigDecimal()
        .div(agent.serviceCount.toBigDecimal())
        .times(HUNDRED_BD)
    }
    
    let graduationThreshold = BigInt.fromI32(100)
    agent.graduationProgress = agent.maturityScore.toBigDecimal()
      .div(graduationThreshold.toBigDecimal())
      .times(HUNDRED_BD)
    
    agent.marketHealthScore = calculateMarketHealthScore(agent)
    agent.networkGrowthContribution = calculateNetworkGrowthContribution(agent)
    
    let prediction = predictGraduation(agent)
    agent.predictedGraduationTimestamp = prediction.predictedGraduationTimestamp
    agent.graduationConfidence = prediction.confidenceScore
    
    agent.save()
    prediction.save()
    
    createMarketHealthSnapshot(agent, event)
    updateNetworkMetrics(event)
  }
}

export function handleStakeUpdated(event: StakeUpdated): void {
  let agent = Agent.load(event.params.virtualId.toString())
  if (agent) {
    let oldStake = agent.totalStaked
    agent.totalStaked = event.params.newStake.toBigDecimal()
    agent.uniqueStakers = event.params.uniqueStakers
    
    if (agent.stakingRewardsDistributed.gt(ZERO_BD) && agent.totalStaked.gt(ZERO_BD)) {
      let timeSinceCreation = event.block.timestamp.minus(agent.createdAt)
      let annualizedRewards = agent.stakingRewardsDistributed
        .times(BigDecimal.fromString('31536000'))
        .div(timeSinceCreation.toBigDecimal())
      agent.stakingAPY = annualizedRewards.div(agent.totalStaked).times(HUNDRED_BD)
      
      agent.hourlyStakingYield = agent.stakingAPY.div(BigDecimal.fromString('8760'))
      agent.dailyStakingYield = agent.stakingAPY.div(BigDecimal.fromString('365'))
      agent.weeklyStakingYield = agent.stakingAPY.div(BigDecimal.fromString('52'))
      agent.monthlyStakingYield = agent.stakingAPY.div(BigDecimal.fromString('12'))
    }
    
    if (oldStake.gt(ZERO_BD)) {
      let duration = event.block.timestamp.minus(agent.lastServiceTimestamp)
      agent.averageStakeDuration = duration
      
      let timeWeight = duration.toBigDecimal().div(BigDecimal.fromString('86400'))
      agent.timeWeightedStake = agent.totalStaked.times(timeWeight)
    }
    
    if (agent.minStakeAmount.equals(ZERO_BD) || agent.totalStaked.lt(agent.minStakeAmount)) {
      agent.minStakeAmount = agent.totalStaked
    }
    if (agent.totalStaked.gt(agent.maxStakeAmount)) {
      agent.maxStakeAmount = agent.totalStaked
    }
    
    if (oldStake.gt(ZERO_BD)) {
      agent.stakingGrowthRate = agent.totalStaked
        .minus(oldStake)
        .div(oldStake)
        .times(HUNDRED_BD)
    }
    
    agent.marketHealthScore = calculateMarketHealthScore(agent)
    agent.networkGrowthContribution = calculateNetworkGrowthContribution(agent)
    
    agent.save()
    
    createMarketHealthSnapshot(agent, event)
  }
}

export function handleRewardDistributed(event: RewardDistributed): void {
  let agent = Agent.load(event.params.virtualId.toString())
  if (agent) {
    agent.stakingRewardsDistributed = agent.stakingRewardsDistributed.plus(event.params.amount.toBigDecimal())
    agent.marketHealthScore = calculateMarketHealthScore(agent)
    agent.save()
    
    createMarketHealthSnapshot(agent, event)
  }
}

export function handleAgentGraduated(event: AgentGraduated): void {
  let agent = Agent.load(event.params.virtualId.toString())
  if (agent) {
    agent.graduatedToUniswap = true
    agent.graduationTimestamp = event.block.timestamp
    
    let impact = new GraduationMarketImpact(agent.id)
    impact.agent = agent.id
    impact.graduationTimestamp = event.block.timestamp
    impact.priceBeforeGraduation = ZERO_BD
    impact.priceAfterGraduation = ZERO_BD
    impact.volumeBeforeGraduation = ZERO_BD
    impact.volumeAfterGraduation = ZERO_BD
    impact.liquidityBeforeGraduation = ZERO_BD
    impact.liquidityAfterGraduation = ZERO_BD
    impact.stakingBehaviorChange = ZERO_BD
    impact.validatorParticipationChange = ZERO_BD
    impact.marketEfficiencyChange = ZERO_BD
    
    let economics = TokenEconomics.load(agent.token.toHexString())
    if (economics) {
      impact.priceBeforeGraduation = economics.volumeWeightedPrice
      impact.volumeBeforeGraduation = economics.totalVolume
      impact.liquidityBeforeGraduation = economics.liquidityDepth
      
      if (agent.totalStaked.gt(ZERO_BD)) {
        impact.stakingBehaviorChange = agent.stakingGrowthRate
      }
      
      if (agent.validatorCount.gt(ZERO_BI)) {
        impact.validatorParticipationChange = agent.activeValidatorCount
          .toBigDecimal()
          .div(agent.validatorCount.toBigDecimal())
          .times(HUNDRED_BD)
      }
      
      impact.marketEfficiencyChange = economics.marketEfficiency
    }
    
    impact.save()
    agent.save()
    
    createMarketHealthSnapshot(agent, event)
  }
}

export function handleContributionSubmitted(event: ContributionSubmitted): void {
  let contributionID = event.params.contributionId.toString()
  let agentID = event.params.virtualId.toString()
  let parentID = event.params.parentContributionId.toString()
  
  let contribution = new Contribution(contributionID)
  contribution.agent = agentID
  contribution.contributor = event.params.contributor
  contribution.coreType = event.params.coreType
  contribution.timestamp = event.block.timestamp
  contribution.accepted = false
  
  if (parentID != '0') {
    contribution.parentContribution = parentID
  }
  
  contribution.save()
  
  let agent = Agent.load(agentID)
  if (agent) {
    let totalContributions = agent.servicesArray.length
    if (totalContributions > 0) {
      agent.contributionAcceptanceRate = agent.successfulServiceCount
        .toBigDecimal()
        .div(BigInt.fromI32(totalContributions).toBigDecimal())
        .times(HUNDRED_BD)
    }
    
    agent.save()
  }
}
