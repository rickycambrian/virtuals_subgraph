import { BigInt, Bytes, log, Address } from "@graphprotocol/graph-ts"
import {
  Launched as LaunchedEvent,
  LaunchCall
} from "../generated/VirtualsProtocol/VirtualsProtocol"
import { TokenLaunch } from "../generated/schema"
import { VirtualsPair as VirtualsPairTemplate, ERC20 as ERC20Template } from "../generated/templates"

export function handleLaunched(event: LaunchedEvent): void {
  log.debug('============= Launched Event Debug =============', [])
  log.debug('Block Number: {}', [event.block.number.toString()])
  log.debug('Transaction Hash: {}', [event.transaction.hash.toHexString()])
  log.debug('Token Address: {}', [event.params.token.toHexString()])
  log.debug('Pair Address: {}', [event.params.pair.toHexString()])
  log.debug('From Address: {}', [event.transaction.from.toHexString()])
  
  // Validate addresses
  if (event.params.token.equals(Bytes.empty()) || event.params.pair.equals(Bytes.empty())) {
    log.error('Invalid token or pair address', [])
    return
  }

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
  
  // Initialize arrays and strings with validation
  launch.cores = []
  launch.urls = []
  launch.name = ''
  launch.ticker = ''
  launch.description = ''
  launch.imageUrl = ''
  launch.purchaseAmount = BigInt.fromI32(0)
  
  launch.save()
  log.info('Successfully saved TokenLaunch entity with ID: {}', [id])

  // Create data sources for the new pair and token
  log.info('Creating data source templates for pair {} and token {}', [
    event.params.pair.toHexString(),
    event.params.token.toHexString()
  ])
  
  // Create pair template - continue even if it fails
  if (!createPairTemplate(event.params.pair)) {
    log.warning('Failed to create VirtualsPair template, continuing...', [])
  }

  // Create token template - continue even if it fails
  if (!createTokenTemplate(event.params.token)) {
    log.warning('Failed to create ERC20 template, continuing...', [])
  }
}

function createPairTemplate(pair: Bytes): boolean {
  if (pair.equals(Bytes.empty())) {
    log.warning('Invalid pair address for template creation', [])
    return false
  }

  VirtualsPairTemplate.create(Address.fromBytes(pair))
  return true
}

function createTokenTemplate(token: Bytes): boolean {
  if (token.equals(Bytes.empty())) {
    log.warning('Invalid token address for template creation', [])
    return false
  }

  ERC20Template.create(Address.fromBytes(token))
  return true
}

export function handleLaunch(call: LaunchCall): void {
  // Input validation
  if (call.inputs._name.length == 0 || call.inputs._ticker.length == 0) {
    log.warning('Invalid name or ticker in launch call', [])
    return
  }

  // Use transaction hash as ID to match with the event
  const id = call.transaction.hash.toHexString()
  let launch = TokenLaunch.load(id)
  
  if (!launch) {
    log.warning('TokenLaunch entity not found for function call. ID: {}', [id])
    return
  }

  log.info('Updating TokenLaunch entity with function parameters. ID: {}', [id])
  
  // Update with function parameters
  launch.name = call.inputs._name
  launch.ticker = call.inputs._ticker
  launch.description = call.inputs.desc
  launch.imageUrl = call.inputs.img
  launch.purchaseAmount = call.inputs.purchaseAmount
  
  // Validate and convert cores array
  if (call.inputs.cores.length > 0) {
    launch.cores = call.inputs.cores
  }
  
  // Validate and convert urls array
  if (call.inputs.urls.length > 0) {
    let urlsArray = new Array<string>()
    for (let i = 0; i < call.inputs.urls.length; i++) {
      // Basic URL validation
      if (call.inputs.urls[i].length > 0) {
        urlsArray.push(call.inputs.urls[i])
      } else {
        log.warning('Empty URL at index: {}', [i.toString()])
      }
    }
    launch.urls = urlsArray
  }
  
  launch.save()
  log.info('Successfully updated TokenLaunch with function parameters', [])
}
