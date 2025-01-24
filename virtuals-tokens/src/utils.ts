import { BigDecimal, BigInt, Bytes, Address } from "@graphprotocol/graph-ts"
import { DailyMetric } from "../generated/schema"
import { ERC20 } from "../generated/templates/TokenTemplate/ERC20"

export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)
export const ZERO_BD = BigDecimal.fromString("0")

export function getDateString(timestamp: BigInt): string {
  let day = timestamp.toI32() / 86400
  let date = new Date(day * 86400 * 1000)
  let year = date.getUTCFullYear().toString()
  let month = (date.getUTCMonth() + 1).toString().padStart(2, "0")
  let dayStr = date.getUTCDate().toString().padStart(2, "0")
  return year + "-" + month + "-" + dayStr
}

export function getDailyMetric(timestamp: BigInt, tokenAddress: string, tokenAddressBytes: Bytes): DailyMetric {
  let dateString = getDateString(timestamp)
  let id = dateString + "-" + tokenAddress
  
  let metric = DailyMetric.load(id)
  if (!metric) {
    metric = new DailyMetric(id)
    metric.date = dateString
    metric.timestamp = timestamp
    metric.tokenAddress = tokenAddress
    metric.tokenAddressBytes = tokenAddressBytes
    metric.volumeToken = ZERO_BI
    metric.volumeUSD = ZERO_BD
    metric.marketCapUSD = ZERO_BD
    metric.priceUSD = ZERO_BD
    metric.swapCount = ZERO_BI
    metric.transferCount = ZERO_BI
  }
  
  return metric
}

export function updateMetricsFromSwap(
  timestamp: BigInt,
  tokenAddress: string,
  tokenAddressBytes: Bytes,
  amountToken: BigInt,
  amountUSD: BigDecimal
): void {
  let metric = getDailyMetric(timestamp, tokenAddress, tokenAddressBytes)
  
  metric.volumeToken = metric.volumeToken.plus(amountToken)
  metric.volumeUSD = metric.volumeUSD.plus(amountUSD)
  metric.swapCount = metric.swapCount.plus(ONE_BI)
  
  // Update price and market cap based on latest swap
  metric.priceUSD = amountUSD.div(new BigDecimal(amountToken))
  // Note: This is a simplified market cap calculation
  metric.marketCapUSD = metric.priceUSD.times(new BigDecimal(getTotalSupply(tokenAddressBytes)))
  
  metric.save()
}

export function updateMetricsFromTransfer(
  timestamp: BigInt,
  tokenAddress: string,
  tokenAddressBytes: Bytes,
  amount: BigInt
): void {
  let metric = getDailyMetric(timestamp, tokenAddress, tokenAddressBytes)
  metric.transferCount = metric.transferCount.plus(ONE_BI)
  metric.save()
}

function getTotalSupply(tokenAddress: Bytes): BigInt {
  let erc20Contract = ERC20.bind(Address.fromBytes(tokenAddress))
  // Since we can't safely call totalSupply() in a subgraph, return 0 for now
  // TODO: Add totalSupply to ERC20 ABI if needed
  return ZERO_BI
}
