import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  OwnershipTransferred,
  LaunchCall
} from "../generated/VirtualsProtocol/VirtualsProtocol"
import { TokenLaunch } from "../generated/schema"

export function handleOwnershipTransferred(event: OwnershipTransferred): void {
  // Create a unique ID for this launch
  const id = event.transaction.hash.concatI32(event.logIndex.toI32())
  
  // Only track successful transactions
  if (!event.transaction.to) return
  
  let launch = new TokenLaunch(id)
  
  // Store both string and bytes versions of addresses
  launch.address = event.params.newOwner.toHexString()
  launch.addressBytes = event.params.newOwner
  launch.tokenCreator = event.transaction.from.toHexString()
  launch.tokenCreatorBytes = event.transaction.from
  
  launch.createdAtBlock = event.block.number
  launch.createdAtTx = event.transaction.hash
  launch.timestamp = event.block.timestamp
  
  launch.save()
}

export function handleLaunch(call: LaunchCall): void {
  // We'll use this handler to track additional launch details if needed
  // The actual entity creation is handled in handleOwnershipTransferred
  // since that's where we get the new token address
}
