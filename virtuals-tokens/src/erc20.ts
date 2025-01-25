import { BigInt, log, Bytes } from "@graphprotocol/graph-ts"
import { Transfer as TransferEvent } from "../generated/templates/ERC20/ERC20"
import { Swap } from "../generated/schema"

const FEE_RECIPIENT_ADDRESS = Bytes.fromHexString("0x9883A9f1284A1F0187401195DC1309F6cC167147")

export function handleTransfer(event: TransferEvent): void {
  // Early validation
  if (!event.transaction || !event.params.to || !event.params.from) {
    return
  }

  // Load swap entity
  const swap = Swap.load(event.transaction.hash)
  if (!swap) {
    return
  }

  // Handle fee transfer
  if (event.params.to.equals(FEE_RECIPIENT_ADDRESS)) {
    swap.feeAmount = event.params.value
    swap.feeRecipient = event.params.to
    swap.save()
    return
  }

  // Handle main token transfer
  if (!event.params.from.equals(FEE_RECIPIENT_ADDRESS) && !event.params.to.equals(FEE_RECIPIENT_ADDRESS)) {
    // For sells, the token being sold is transferred first
    if (swap.tokenIn.equals(event.address)) {
      swap.tokenIn = event.params.from
      swap.tokenOut = event.params.to
      swap.save()
    }
  }
}
