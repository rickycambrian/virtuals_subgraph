import { BigInt, log, dataSource } from "@graphprotocol/graph-ts"
import { updateMetricsFromTransfer } from "./utils"
import { Transfer as TransferEvent, Approval as ApprovalEvent } from "../generated/templates/TokenTemplate/ERC20"
import { TradeEvent } from "../generated/schema"

const VIRTUAL_TOKEN = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b"

export function handleTransfer(event: TransferEvent): void {
  let id = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.logIndex.toString())

  let trade = new TradeEvent(id)
  trade.transactionHash = event.transaction.hash
  trade.blockNumber = event.block.number
  trade.timestamp = event.block.timestamp
  trade.eventType = "Transfer"
  
  trade.tokenAddress = event.address.toHexString()
  trade.tokenAddressBytes = event.address
  
  trade.fromAddress = event.params.from.toHexString()
  trade.fromAddressBytes = event.params.from
  trade.toAddress = event.params.to.toHexString()
  trade.toAddressBytes = event.params.to
  
  trade.amountIn = event.params.value
  
  // Get context data
  let context = dataSource.context()
  let tokenAddress = context.getString("token")
  
  // Track all transfers for both input tokens and VIRTUAL token
  if (event.address.toHexString() == VIRTUAL_TOKEN || event.address.toHexString() == tokenAddress) {
    trade.save()
    
    // Update daily metrics
    updateMetricsFromTransfer(
      event.block.timestamp,
      tokenAddress,
      event.address,
      event.params.value
    )
    
    log.info('Successfully saved Transfer TradeEvent with ID: {} for token {}', [id, tokenAddress])
  }
}

export function handleApproval(event: ApprovalEvent): void {
  let id = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.logIndex.toString())

  let trade = new TradeEvent(id)
  trade.transactionHash = event.transaction.hash
  trade.blockNumber = event.block.number
  trade.timestamp = event.block.timestamp
  trade.eventType = "Approval"
  
  trade.tokenAddress = event.address.toHexString()
  trade.tokenAddressBytes = event.address
  
  trade.fromAddress = event.params.owner.toHexString()
  trade.fromAddressBytes = event.params.owner
  trade.toAddress = event.params.spender.toHexString()
  trade.toAddressBytes = event.params.spender
  
  trade.amountIn = event.params.value
  
  // Get context data
  let context = dataSource.context()
  let tokenAddress = context.getString("token")
  
  // Track approvals for both input tokens and VIRTUAL token
  if (event.address.toHexString() == VIRTUAL_TOKEN || event.address.toHexString() == tokenAddress) {
    trade.save()
    log.info('Successfully saved Approval TradeEvent with ID: {} for token {}', [id, tokenAddress])
  }
}
