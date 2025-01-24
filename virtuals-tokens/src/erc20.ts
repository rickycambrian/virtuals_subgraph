import { BigInt, log } from "@graphprotocol/graph-ts"
import { Transfer as TransferEvent } from "../generated/templates/ERC20/ERC20"
import { Swap } from "../generated/schema"

const FEE_RECIPIENT = "0x9883A9f1284A1F0187401195DC1309F6cC167147"

export function handleTransfer(event: TransferEvent): void {
  const id = event.transaction.hash.toHexString()
  let swap = Swap.load(id)

  if (swap) {
    // If this is a fee transfer (to the fee recipient)
    if (event.params.to.toHexString() == FEE_RECIPIENT) {
      swap.feeAmount = event.params.value
      swap.feeRecipient = event.params.to
    } 
    // If this is the main token transfer
    else if (event.params.from.toHexString() != FEE_RECIPIENT && event.params.to.toHexString() != FEE_RECIPIENT) {
      // For sells, the token being sold is transferred first
      if (swap.tokenIn.equals(event.address)) {
        swap.tokenIn = event.params.from
        swap.tokenOut = event.params.to
      }
    }

    swap.save()
    log.info('Updated Swap entity with Transfer info. ID: {}', [id])
  }
}
