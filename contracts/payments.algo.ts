import {
  BoxMap,
  Contract,
  Account,
  uint64,
  assert,
  GlobalState,
  Txn,
  gtxn,
  Global,
  itxn,
} from "@algorandfoundation/algorand-typescript";

function coverFee() {
  const feePayment = gtxn.PaymentTxn(Txn.groupIndex + 1);

  // Only cover the fee if the next txn is 0 ALGO pay that closes back to the app
  if (
    // We probably don't care who the sender is, but check here just to be safe
    feePayment.sender === Txn.sender &&
    // Checking the receiver is probably superfluous since we later check close, but might as well be safe
    feePayment.receiver === Global.currentApplicationAddress &&
    // Ensure the amount is zero so we can be sure the account is not spending ALGO on anything else
    feePayment.amount === 0 &&
    // Always close to the app to ensure it gets back any excess from the sender
    // This is especially important since we always send Global.minBalance
    // This is also important for the future when fees may be refundable
    feePayment.closeRemainderTo === Global.currentApplicationAddress
    // NOTE: We don't do any fee amount checks here since the fees may be partially covered by
    // some other txn in the group
  ) {
    itxn
      .payment({
        receiver: Txn.sender,
        // We always add Global.minBalance assuming the account has 0 ALGO
        amount: Global.minBalance + feePayment.fee,
      })
      .submit();
  }
}

export class Payments extends Contract {
  admin = GlobalState<Account>({ key: "a" });

  balances = BoxMap<Account, uint64>({ keyPrefix: "b" });

  nonCirculatingSupply = GlobalState<uint64>({ key: "n" });

  circulatingSupply = GlobalState<uint64>({ key: "c" });

  createApplication(supply: uint64) {
    this.admin.value = Txn.sender;
    this.nonCirculatingSupply.value = supply;
    this.circulatingSupply.value = 0;
  }

  addToCirculation(amount: uint64, receiver: Account) {
    assert(Txn.sender === this.admin.value, "only admin can circulate tokens");
    assert(this.balances(receiver).exists, "receiver does not exist");

    this.circulatingSupply.value += amount;
    this.nonCirculatingSupply.value -= amount;
    this.balances(receiver).value += amount;
  }

  instantiateAccount(account: Account) {
    assert(
      Txn.sender === this.admin.value,
      "only admin can instantiate accounts",
    );
    this.balances(account).value = 0;
  }

  transfer(sender: Account, receiver: Account, amount: uint64) {
    assert(this.balances(sender).exists, "sender does not exist");
    assert(this.balances(receiver).exists, "receiver does not exist");
    this.balances(sender).value -= amount;
    this.balances(receiver).value += amount;

    coverFee();
  }
}
