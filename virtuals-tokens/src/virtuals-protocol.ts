import { BigInt, Bytes, log } from "@graphprotocol/graph-ts"
import {
  Launched as LaunchedEvent
} from "../generated/VirtualsProtocol/VirtualsProtocol"
import { TokenLaunch } from "../generated/schema"

export function handleLaunched(event: LaunchedEvent): void {
  log.debug('============= Launched Event Debug =============', [])
  log.debug('Block Number: {}', [event.block.number.toString()])
  log.debug('Transaction Hash: {}', [event.transaction.hash.toHexString()])
  log.debug('Token Address: {}', [event.params.token.toHexString()])
  log.debug('Pair Address: {}', [event.params.pair.toHexString()])
  log.debug('From Address: {}', [event.transaction.from.toHexString()])
  
  // Create a unique ID using the transaction hash and log index
  const idBytes = event.transaction.hash.concatI32(event.logIndex.toI32())
  const id = idBytes.toHexString()
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
  
  log.info('Saving TokenLaunch entity with values:', [])
  log.info('- address: {}', [launch.address])
  log.info('- tokenCreator: {}', [launch.tokenCreator])
  log.info('- block: {}', [launch.createdAtBlock.toString()])
  
  launch.save()
  log.info('Successfully saved TokenLaunch entity with ID: {}', [id])
  
  log.debug('============= End Launched Event =============', [])
}
