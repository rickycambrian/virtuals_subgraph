import { BigInt, BigDecimal, Bytes, ethereum } from '@graphprotocol/graph-ts'
import {
  Agent,
  Validator,
  Contribution,
  Service,
  AgentDayData,
  MaturityScoreSnapshot,
  TokenEconomics,
  EconomicSnapshot
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

function createMaturityScoreSnapshot(
  agent: Agent,
  newScore: BigInt,
  timestamp: BigInt,
  blockNumber: BigInt
): void {
  let snapshotId = agent.id.toString() + '-' + timestamp.toString()
  let snapshot = new MaturityScoreSnapshot(snapshotId)
  snapshot.agent = agent.id
  snapshot.timestamp = timestamp
  snapshot.score = newScore
  snapshot.blockNumber = blockNumber
  
  // Calculate growth rate from previous score
  let growthRate = ZERO_BD
  if (agent.maturityScore.gt(ZERO_BI)) {
    let scoreDiff = newScore.minus(agent.maturityScore).toBigDecimal()
    growthRate = scoreDiff.times(HUNDRED_BD).div(agent.maturityScore.toBigDecimal())
  }
  snapshot.growthRate = growthRate
  snapshot.save()
}

function updateTokenEconomics(
  token: Bytes,
  event: ethereum.Event,
  priceImpact: BigDecimal,
  liquidityChange: BigDecimal
): void {
  let economics = TokenEconomics.load(token.toHexString())
  if (!economics) {
    economics = new TokenEconomics(token.toHexString())
    economics.token = token
    economics.liquidityDepth = ZERO_BD
    economics.liquidityUtilization = ZERO_BD
    economics.tokenVelocity = ZERO_BD
    economics.holdingTimeAverage = ZERO_BI
    economics.rewardDistributionEfficiency = ZERO_BD
    economics.stakingYield = ZERO_BD
    economics.validatorYield = ZERO_BD
  }
  
  economics.updateTimestamp = event.block.timestamp
  economics.liquidityDepth = economics.liquidityDepth.plus(liquidityChange)
  // Update other economic metrics based on the event
  economics.save()
  
  // Create economic snapshot
  let snapshotId = token.toHexString() + '-' + event.block.timestamp.toString()
  let snapshot = new EconomicSnapshot(snapshotId)
  snapshot.token = token
  snapshot.timestamp = event.block.timestamp
  snapshot.priceUSD = ZERO_BD // TODO: Get actual price
  snapshot.liquidityDepth = economics.liquidityDepth
  snapshot.tokenVelocity = economics.tokenVelocity
  snapshot.rewardEfficiency = economics.rewardDistributionEfficiency
  snapshot.triggerType = event.block.number.toString() + '-' + event.logIndex.toString()
  snapshot.triggerAddress = event.transaction.from
  snapshot.save()
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
  
  // Initialize performance fields
  agent.graduationProgress = ZERO_BD
  agent.serviceSuccessRate = ZERO_BD
  agent.performanceRank = ZERO_BI
  agent.lastRankUpdate = event.block.timestamp
  agent.servicesArray = []
  
  // Initialize additional analytics fields
  agent.averageStakeDuration = ZERO_BI
  agent.stakingAPY = ZERO_BD
  agent.validatorCount = ZERO_BI
  agent.activeValidatorCount = ZERO_BI
  agent.totalServiceImpact = ZERO_BD
  agent.averageServiceImpact = ZERO_BD
  agent.lastServiceTimestamp = event.block.timestamp
  agent.contributionAcceptanceRate = ZERO_BD
  agent.save()
  
  // Create initial maturity score snapshot
  createMaturityScoreSnapshot(agent, ZERO_BI, event.block.timestamp, event.block.number)

  // Create initial day data
  let dayID = agent.id.toString() + '-' + event.block.timestamp.toString()
  let dayData = new AgentDayData(dayID)
  dayData.agent = agent.id
  dayData.date = event.block.timestamp
  
  // Initialize staking metrics
  dayData.dailyStakeAmount = ZERO_BD
  dayData.dailyUnstakeAmount = ZERO_BD
  dayData.netStakingChange = ZERO_BD
  dayData.uniqueDailyStakers = ZERO_BI
  dayData.averageStakeSize = ZERO_BD
  
  // Initialize service metrics
  dayData.newContributions = ZERO_BI
  dayData.acceptedServices = ZERO_BI
  dayData.dailyImpactScore = ZERO_BD
  
  // Initialize reward metrics
  dayData.dailyRewardsGenerated = ZERO_BD
  dayData.stakersRewards = ZERO_BD
  dayData.validatorsRewards = ZERO_BD
  dayData.contributorsRewards = ZERO_BD
  dayData.protocolRewards = ZERO_BD
  dayData.rewardPerStake = ZERO_BD
  
  // Initialize validator metrics
  dayData.activeValidators = ZERO_BI
  dayData.averageValidatorScore = ZERO_BD
  dayData.validationsPerValidator = ZERO_BD
  
  // Initialize performance fields
  dayData.maturityScoreChange = ZERO_BD
  dayData.serviceSuccessCount = ZERO_BI
  dayData.serviceFailureCount = ZERO_BI
  dayData.dailySuccessRate = ZERO_BD
  dayData.performanceScore = ZERO_BD
  
  // Initialize distribution metrics
  dayData.stakeSizeDistribution = []
  dayData.impactScoreDistribution = []
  dayData.validatorScoreDistribution = []
  dayData.save()
}

export function handleAgentGraduated(event: AgentGraduated): void {
  let agent = Agent.load(event.params.virtualId.toString())
  if (agent) {
    agent.graduatedToUniswap = true
    agent.graduationTimestamp = event.block.timestamp
    agent.save()
  }
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
  validator.save()

  // Update agent metrics
  let agent = Agent.load(event.params.virtualId.toString())
  if (agent) {
    agent.validatorCount = agent.validatorCount.plus(ONE_BI)
    agent.activeValidatorCount = agent.activeValidatorCount.plus(ONE_BI)
    agent.save()
  }

  // Update agent day data
  let dayID = event.params.virtualId.toString() + '-' + event.block.timestamp.toString()
  let dayData = AgentDayData.load(dayID)
  if (dayData) {
    dayData.activeValidators = dayData.activeValidators.plus(ONE_BI)
    
    // Update validator score distribution
    let scores = dayData.validatorScoreDistribution
    scores.push(ZERO_BD)
    dayData.validatorScoreDistribution = scores
    
    // Update validations per validator
    if (dayData.activeValidators.gt(ZERO_BI)) {
      dayData.validationsPerValidator = BigDecimal.fromString(dayData.serviceSuccessCount.toString())
        .div(dayData.activeValidators.toBigDecimal())
    }
    
    dayData.save()
  }
}

export function handleValidatorScoreUpdated(event: ValidatorScoreUpdated): void {
  let validatorID = event.params.virtualId.toString() + '-' + event.params.validator.toHexString()
  let validator = Validator.load(validatorID)
  if (validator) {
    validator.score = event.params.newScore
    validator.lastActiveTimestamp = event.block.timestamp
    validator.validationCount = validator.validationCount.plus(ONE_BI)
    validator.save()

    // Update agent day data
    let dayID = event.params.virtualId.toString() + '-' + event.block.timestamp.toString()
    let dayData = AgentDayData.load(dayID)
    if (dayData) {
      // Update average validator score directly
      dayData.averageValidatorScore = event.params.newScore.toBigDecimal()
      
      // Update validator score distribution
      let scores = dayData.validatorScoreDistribution
      scores.push(event.params.newScore.toBigDecimal())
      dayData.validatorScoreDistribution = scores
      
      dayData.save()
    }
  }
}

export function handleContributionSubmitted(event: ContributionSubmitted): void {
  let contributionID = event.params.contributionId.toString()
  let contribution = new Contribution(contributionID)
  contribution.agent = event.params.virtualId.toString()
  contribution.contributor = event.params.contributor
  contribution.coreType = event.params.coreType
  contribution.timestamp = event.block.timestamp
  contribution.accepted = false
  
  // Handle parent contribution if exists
  if (event.params.parentContributionId) {
    contribution.parentContribution = event.params.parentContributionId.toString()
  }
  
  contribution.save()

  // Update day data
  let dayID = event.params.virtualId.toString() + '-' + event.block.timestamp.toString()
  let dayData = AgentDayData.load(dayID)
  if (dayData) {
    dayData.newContributions = dayData.newContributions.plus(ONE_BI)
    dayData.save()
  }
}

export function handleServiceAccepted(event: ServiceAccepted): void {
  let serviceID = event.params.serviceId.toString()
  let contributionID = event.params.contributionId.toString()
  let agentID = event.params.virtualId.toString()
  
  // Load agent first
  let agent = Agent.load(agentID)
  if (!agent) {
    return
  }

  let service = new Service(serviceID)
  service.agent = agentID
  service.contribution = contributionID
  service.maturityScore = event.params.maturityScore
  service.impact = event.params.impact.toBigDecimal()
  service.coreType = event.params.coreType
  service.timestamp = event.block.timestamp
  service.rewardsGenerated = ZERO_BD
  service.priceImpact = ZERO_BD
  service.rewardEfficiency = ZERO_BD
  service.liquidityEffect = ZERO_BD
  service.token = agent.token
  service.save()
  
  // Update agent's metrics
  agent.totalServiceImpact = agent.totalServiceImpact.plus(service.impact)
  agent.lastServiceTimestamp = event.block.timestamp
  
  // Calculate average service impact
  let totalServices = BigInt.fromI32(agent.servicesArray.length)
  if (totalServices.gt(ZERO_BI)) {
    agent.averageServiceImpact = agent.totalServiceImpact.div(totalServices.toBigDecimal())
  }
  
  // Add service to agent's services array
  let services = agent.servicesArray
  services.push(serviceID)
  agent.servicesArray = services
  
  // Calculate service success rate based on impact threshold
  let successCount = ZERO_BI
  let totalCount = BigInt.fromI32(services.length)
  
  for (let i = 0; i < services.length; i++) {
    let serviceEntity = Service.load(services[i])
    if (serviceEntity && serviceEntity.impact.gt(ZERO_BD)) {
      successCount = successCount.plus(ONE_BI)
    }
  }
  
  if (totalCount.gt(ZERO_BI)) {
    agent.serviceSuccessRate = successCount.toBigDecimal()
      .div(totalCount.toBigDecimal())
      .times(HUNDRED_BD)
  }
  
  // Update graduation progress (example calculation)
  let graduationThreshold = BigInt.fromI32(100) // Example threshold
  agent.graduationProgress = agent.maturityScore.toBigDecimal()
    .div(graduationThreshold.toBigDecimal())
    .times(HUNDRED_BD)
  
  agent.save()

  // Update contribution
  let contribution = Contribution.load(contributionID)
  if (contribution) {
    contribution.accepted = true
    contribution.service = serviceID
    contribution.save()
  }

  // Update day data with new performance fields
  let dayID = agent.id.toString() + '-' + event.block.timestamp.toString()
  let dayData = AgentDayData.load(dayID)
  if (dayData) {
    dayData.acceptedServices = dayData.acceptedServices.plus(ONE_BI)
    dayData.dailyImpactScore = dayData.dailyImpactScore.plus(event.params.impact.toBigDecimal())
    dayData.serviceSuccessCount = dayData.serviceSuccessCount.plus(ONE_BI)
    dayData.dailySuccessRate = dayData.serviceSuccessCount
      .toBigDecimal()
      .div(dayData.acceptedServices.toBigDecimal())
      .times(HUNDRED_BD)
    
    // Calculate performance score based on impact and success rate
    dayData.performanceScore = dayData.dailyImpactScore
      .times(dayData.dailySuccessRate)
      .div(HUNDRED_BD)
    
    // Update impact score distribution
    let impacts = dayData.impactScoreDistribution
    impacts.push(service.impact)
    dayData.impactScoreDistribution = impacts
    
    dayData.save()
  }
  
  // Update token economics
  let priceImpact = event.params.impact.toBigDecimal().div(HUNDRED_BD)
  let liquidityEffect = ZERO_BD // Calculate based on your requirements
  
  updateTokenEconomics(
    agent.token,
    event,
    priceImpact,
    liquidityEffect
  )
}

export function handleStakeUpdated(event: StakeUpdated): void {
  let agent = Agent.load(event.params.virtualId.toString())
  if (agent) {
    let oldStake = agent.totalStaked
    agent.totalStaked = event.params.newStake.toBigDecimal()
    agent.uniqueStakers = event.params.uniqueStakers
    
    // Calculate APY if we have rewards distributed
    if (agent.stakingRewardsDistributed.gt(ZERO_BD) && agent.totalStaked.gt(ZERO_BD)) {
      let timeSinceCreation = event.block.timestamp.minus(agent.createdAt)
      let annualizedRewards = agent.stakingRewardsDistributed
        .times(BigDecimal.fromString('31536000')) // seconds in a year
        .div(timeSinceCreation.toBigDecimal())
      agent.stakingAPY = annualizedRewards.div(agent.totalStaked).times(HUNDRED_BD)
    }
    
    // Update stake duration
    if (oldStake.gt(ZERO_BD)) {
      let duration = event.block.timestamp.minus(agent.lastServiceTimestamp)
      agent.averageStakeDuration = duration
    }
    
    agent.save()

    // Update day data
    let dayID = agent.id.toString() + '-' + event.block.timestamp.toString()
    let dayData = AgentDayData.load(dayID)
    if (dayData) {
      let stakeChange = event.params.newStake.toBigDecimal().minus(event.params.oldStake.toBigDecimal())
      if (stakeChange.gt(ZERO_BD)) {
        dayData.dailyStakeAmount = dayData.dailyStakeAmount.plus(stakeChange)
      } else {
        dayData.dailyUnstakeAmount = dayData.dailyUnstakeAmount.plus(ZERO_BD.minus(stakeChange))
      }
      dayData.netStakingChange = dayData.dailyStakeAmount.minus(dayData.dailyUnstakeAmount)
      dayData.uniqueDailyStakers = event.params.uniqueStakers
      
      // Calculate average stake size
      if (dayData.uniqueDailyStakers.gt(ZERO_BI)) {
        dayData.averageStakeSize = agent.totalStaked.div(dayData.uniqueDailyStakers.toBigDecimal())
      }
      
      // Calculate reward per stake
      if (agent.totalStaked.gt(ZERO_BD)) {
        dayData.rewardPerStake = dayData.dailyRewardsGenerated.div(agent.totalStaked)
      }
      
      // Update stake size distribution
      let stakeSizes = dayData.stakeSizeDistribution
      stakeSizes.push(agent.totalStaked)
      dayData.stakeSizeDistribution = stakeSizes
      
      dayData.save()
    }
  }
}

export function handleRewardDistributed(event: RewardDistributed): void {
  let agent = Agent.load(event.params.virtualId.toString())
  if (agent) {
    agent.stakingRewardsDistributed = agent.stakingRewardsDistributed.plus(event.params.amount.toBigDecimal())
    agent.save()

    // Update day data
    let dayID = agent.id.toString() + '-' + event.block.timestamp.toString()
    let dayData = AgentDayData.load(dayID)
    if (dayData) {
      dayData.dailyRewardsGenerated = dayData.dailyRewardsGenerated.plus(event.params.amount.toBigDecimal())
      
      // Update specific reward types based on recipient type
      if (event.params.recipientType == 0) { // Stakers
        dayData.stakersRewards = dayData.stakersRewards.plus(event.params.amount.toBigDecimal())
      } else if (event.params.recipientType == 1) { // Validators
        dayData.validatorsRewards = dayData.validatorsRewards.plus(event.params.amount.toBigDecimal())
      } else if (event.params.recipientType == 2) { // Contributors
        dayData.contributorsRewards = dayData.contributorsRewards.plus(event.params.amount.toBigDecimal())
      } else if (event.params.recipientType == 3) { // Protocol
        dayData.protocolRewards = dayData.protocolRewards.plus(event.params.amount.toBigDecimal())
      }
      
      // Update reward per stake
      if (agent.totalStaked.gt(ZERO_BD)) {
        dayData.rewardPerStake = dayData.dailyRewardsGenerated.div(agent.totalStaked)
      }
      
      dayData.save()
    }
  }
}
