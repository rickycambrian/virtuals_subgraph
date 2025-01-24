import { BigInt, Bytes, log, store, DataSourceContext } from "@graphprotocol/graph-ts"
import {
  Launched as LaunchedEvent,
  LaunchCall
} from "../generated/VirtualsProtocol/VirtualsProtocol"
import { TokenLaunch, TradeEvent } from "../generated/schema"
import { PairTemplate, TokenTemplate } from "../generated/templates"

const VIRTUAL_TOKEN = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b"

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
  
  // Create data sources for the new pair and token contracts
  let pairContext = new DataSourceContext()
  pairContext.setString("token", event.params.token.toHexString())
  pairContext.setString("pair", event.params.pair.toHexString())
  PairTemplate.createWithContext(event.params.pair, pairContext)
  log.info('Created PairTemplate data source for pair: {}', [event.params.pair.toHexString()])

  // Create data source for the new token
  let tokenContext = new DataSourceContext()
  tokenContext.setString("token", event.params.token.toHexString())
  TokenTemplate.createWithContext(event.params.token, tokenContext)
  log.info('Created TokenTemplate data source for token: {}', [event.params.token.toHexString()])
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
