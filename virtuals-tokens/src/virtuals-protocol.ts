import { BigInt, Bytes, log, store } from "@graphprotocol/graph-ts"
import {
  Launched as LaunchedEvent,
  LaunchCall
} from "../generated/VirtualsProtocol/VirtualsProtocol"
import {
  Transfer as TransferEvent,
  Approval as ApprovalEvent,
  SellCall
} from "../generated/ERC20Token/ERC20"
import {
  Swap as SwapEvent
} from "../generated/PairContract/Pair"
import { TokenLaunch, TradeEvent } from "../generated/schema"

export function handleLaunched(event: LaunchedEvent): void {
  log.debug('============= Launched Event Debug =============', [])
  log.debug('Block Number: {}', [event.block.number.toString()])
  log.debug('Transaction Hash: {}', [event.transaction.hash.toHexString()])
  log.debug('Token Address: {}', [event.params.token.toHexString()])
  log.debug('Pair Address: {}', [event.params.pair.toHexString()])
  log.debug('From Address: {}', [event.transaction.from.toHexString()])
  
  // Create a unique ID using the transaction hash and log index
  const id = event.transaction.hash.toHexString()
  log.info('Creating TokenLaunch entity with ID: {}', [id])
  
  let launch = new TokenLaunch(id)
  
  // Store both string and bytes versions of addresses
  launch.address = event.params.token.toHexString()
  launch.addressBytes = event.params.token
  launch.tokenCreator = event.transaction.from.toHexString()
  launch.tokenCreatorBytes = event.transaction.from
  
  launch.createdAtBlock = event.block.number
  launch.createdAtTx = event.transaction.hash
  launch.timestamp = event.block.timestamp
  
  // Initialize arrays and strings
  launch.cores = []
  launch.urls = []
  launch.name = ''
  launch.ticker = ''
  launch.description = ''
  launch.imageUrl = ''
  launch.purchaseAmount = BigInt.fromI32(0)
  
  launch.save()
  log.info('Successfully saved TokenLaunch entity with ID: {}', [id])
}

export function handleLaunch(call: LaunchCall): void {
  // Use transaction hash as ID to match with the event
  const id = call.transaction.hash.toHexString()
  let launch = TokenLaunch.load(id)
  
  if (launch) {
    log.info('Updating TokenLaunch entity with function parameters. ID: {}', [id])
    
    // Update with function parameters
    launch.name = call.inputs._name
    launch.ticker = call.inputs._ticker
    launch.description = call.inputs.desc
    launch.imageUrl = call.inputs.img
    launch.purchaseAmount = call.inputs.purchaseAmount
    
    // Convert cores array
    let coresArray = new Array<i32>()
    for (let i = 0; i < call.inputs.cores.length; i++) {
      coresArray.push(call.inputs.cores[i])
    }
    launch.cores = coresArray
    
    // Convert urls array
    let urlsArray = new Array<string>()
    for (let i = 0; i < call.inputs.urls.length; i++) {
      urlsArray.push(call.inputs.urls[i])
    }
    launch.urls = urlsArray
    
    launch.save()
    log.info('Successfully updated TokenLaunch with function parameters', [])
  } else {
    log.warning('TokenLaunch entity not found for function call. ID: {}', [id])
  }
}

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
  
  trade.save()
  log.info('Successfully saved Transfer TradeEvent with ID: {}', [id])
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
  
  trade.save()
  log.info('Successfully saved Approval TradeEvent with ID: {}', [id])
}

export function handleSwap(event: SwapEvent): void {
  let id = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.logIndex.toString())

  let trade = new TradeEvent(id)
  trade.transactionHash = event.transaction.hash
  trade.blockNumber = event.block.number
  trade.timestamp = event.block.timestamp
  trade.eventType = "Swap"
  
  trade.tokenAddress = event.address.toHexString()
  trade.tokenAddressBytes = event.address
  
  // For Swap events, we store the detailed amounts
  trade.amount0In = event.params.amount0In
  trade.amount0Out = event.params.amount0Out
  trade.amount1In = event.params.amount1In
  trade.amount1Out = event.params.amount1Out
  
  // Set the main amountIn/Out fields for consistency
  if (event.params.amount0In.gt(BigInt.fromI32(0))) {
    trade.amountIn = event.params.amount0In
  } else {
    trade.amountIn = event.params.amount1In
  }
  
  if (event.params.amount0Out.gt(BigInt.fromI32(0))) {
    trade.amountOut = event.params.amount0Out
  } else {
    trade.amountOut = event.params.amount1Out
  }
  
  trade.save()
  log.info('Successfully saved Swap TradeEvent with ID: {}', [id])
}

export function handleSell(call: SellCall): void {
  const id = call.transaction.hash.toHexString()
  
  let trade = new TradeEvent(id)
  trade.transactionHash = call.transaction.hash
  trade.blockNumber = call.block.number
  trade.timestamp = call.block.timestamp
  trade.eventType = "Sell"
  
  trade.tokenAddress = call.inputs.tokenAddress.toHexString()
  trade.tokenAddressBytes = call.inputs.tokenAddress
  trade.fromAddress = call.from.toHexString()
  trade.fromAddressBytes = call.from
  
  trade.amountIn = call.inputs.amountIn
  
  trade.save()
  log.info('Successfully saved Sell TradeEvent with ID: {}', [id])
}
