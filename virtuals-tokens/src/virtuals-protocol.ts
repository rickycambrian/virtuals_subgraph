import { BigInt, log, Bytes, Value, Entity } from "@graphprotocol/graph-ts"
import {
  Launched as LaunchedEvent,
  LaunchCall
} from "../generated/VirtualsProtocol/VirtualsProtocol"
import { TokenLaunch } from "../generated/schema"
import { VirtualsPair as VirtualsPairTemplate, ERC20 as ERC20Template } from "../generated/templates"

export function handleLaunched(event: LaunchedEvent): void {
  // Early validation of required event data
  if (!event.transaction || !event.block) {
    return
  }

  // Get transaction hash as ID
  const id = event.transaction.hash
  
  // Create token launch entity
  let launch = new TokenLaunch(id.toHexString())
  
  // Set addresses - these are indexed parameters and always exist
  launch.address = event.params.token.toHexString()
  launch.addressBytes = event.params.token
  launch.tokenCreator = event.transaction.from.toHexString()
  launch.tokenCreatorBytes = event.transaction.from
  
  // Set block data
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
  
  // Save entity
  launch.save()

  // Validate template addresses
  if (event.params.pair.equals(Bytes.empty())) {
    log.error('Invalid pair address for template creation', [])
    return
  }
  if (event.params.token.equals(Bytes.empty())) {
    log.error('Invalid token address for template creation', [])
    return
  }

  // Create data source templates with logging
  log.info('Creating templates for pair: {} and token: {}', [
    event.params.pair.toHexString(),
    event.params.token.toHexString()
  ])

  VirtualsPairTemplate.create(event.params.pair)
  ERC20Template.create(event.params.token)
  
  log.info(
    'Successfully created TokenLaunch entity and templates for token {} and pair {}',
    [event.params.token.toHexString(), event.params.pair.toHexString()]
  )
}

export function handleLaunch(call: LaunchCall): void {
  // Early validation
  if (!call.transaction) {
    return
  }

  // Get transaction hash as ID
  const id = call.transaction.hash.toHexString()
  let launch = TokenLaunch.load(id)
  
  if (launch) {
    // Update with function parameters
    launch.name = call.inputs._name
    launch.ticker = call.inputs._ticker
    launch.description = call.inputs.desc
    launch.imageUrl = call.inputs.img
    launch.purchaseAmount = call.inputs.purchaseAmount
    
    // Convert cores array - uint8[] becomes array of integers
    let coresArray: Array<Value> = []
    for (let i = 0; i < call.inputs.cores.length; i++) {
      const value = call.inputs.cores[i]
      if (value) {
        // Convert uint8 to integer using numeric value
        const numValue = value.toString()
        const intValue = Value.fromI32(BigInt.fromString(numValue).toI32())
        coresArray.push(intValue)
      }
    }
    launch.set("cores", Value.fromArray(coresArray))
    
    // Convert urls array
    let urlsArray = new Array<string>()
    for (let i = 0; i < call.inputs.urls.length; i++) {
      urlsArray.push(call.inputs.urls[i])
    }
    launch.urls = urlsArray
    
    launch.save()
    log.info('Updated TokenLaunch entity {}', [id])
  } else {
    log.warning('TokenLaunch entity not found for function call {}', [id])
  }
}
