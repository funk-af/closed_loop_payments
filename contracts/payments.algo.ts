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
  baremethod,
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

export type Transfer = { receiver: Account; amount: uint64 };

export class Payments extends Contract {
  nonCirculatingSupply = GlobalState<uint64>({ key: "n" });
  circulatingSupply = GlobalState<uint64>({ key: "c" });
  allowP2P = GlobalState<boolean>({ key: "p" });

  balances = BoxMap<Account, uint64>({ keyPrefix: "b" });
  vendors = BoxMap<Account, uint64>({ keyPrefix: "v" });

  createApplication(supply: uint64, allowP2P: boolean) {
    this.nonCirculatingSupply.value = supply;
    this.circulatingSupply.value = 0;
    this.allowP2P.value = allowP2P;
  }

  instantiateAccount(account: Account, amount: uint64, isVendor: boolean) {
    assert(
      Txn.sender === Global.creatorAddress,
      "only admin can instantiate accounts",
    );
    assert(!this.balances(account).exists, "account already exists");
    this.balances(account).value = 0;
    if (amount > 0) {
      this.addToCirculation(account, amount);
    }
    if (isVendor) {
      this.vendors(account).value = 0;
    }
  }

  addToCirculation(receiver: Account, amount: uint64) {
    assert(
      Txn.sender === Global.creatorAddress,
      "only admin can circulate tokens",
    );
    assert(this.balances(receiver).exists, "receiver does not exist");

    this.circulatingSupply.value += amount;
    this.nonCirculatingSupply.value -= amount;
    this.balances(receiver).value += amount;
  }

  private _transfer(sender: Account, receiver: Account, amount: uint64) {
    assert(this.balances(sender).exists, "sender does not exist");
    assert(this.balances(receiver).exists, "receiver does not exist");
    this.balances(sender).value -= amount;
    this.balances(receiver).value += amount;
  }

  transfer(receiver: Account, amount: uint64) {
    if (!this.allowP2P.value) {
      assert(
        this.vendors(Txn.sender).exists || this.vendors(receiver).exists,
        "peer to peer transfers are not allowed, one party must be a vendor",
      );
    }
    this._transfer(Txn.sender, receiver, amount);
    coverFee();
  }

  clawback(sender: Account, receiver: Account, amount: uint64) {
    assert(Txn.sender === Global.creatorAddress, "only admin can clawback");
    this._transfer(sender, receiver, amount);
  }

  cashout(amount: uint64) {
    assert(this.balances(Txn.sender).exists, "sender does not exist");

    this.circulatingSupply.value -= amount;
    this.nonCirculatingSupply.value += amount;
    this.balances(Txn.sender).value -= amount;
    coverFee();
  }

  promoteVendor(account: Account) {
    assert(Txn.sender === Global.creatorAddress, "only admin can add vendors");
    this.vendors(account).value = 0;
  }

  revokeVendor(account: Account) {
    assert(
      Txn.sender === Global.creatorAddress,
      "only admin can remove vendors",
    );
    assert(this.vendors(account).exists, "vendor does not exist");
    this.vendors(account).delete();
  }

  recover(oldAccount: Account, newAccount: Account) {
    assert(
      Txn.sender === Global.creatorAddress,
      "only admin can recover account",
    );
    assert(this.balances(oldAccount).exists, "old account does not exist");
    assert(!this.balances(newAccount).exists, "new account already exists");
    this.balances(newAccount).value = this.balances(oldAccount).value;
    this.balances(oldAccount).delete();
  }

  deleteAccount(account: Account) {
    assert(
      Txn.sender === Global.creatorAddress,
      "only admin can delete accounts",
    );
    assert(this.balances(account).exists, "account does not exist");
    if (this.balances(account).value > 0) {
      this.circulatingSupply.value -= this.balances(account).value;
      this.nonCirculatingSupply.value += this.balances(account).value;
    }

    this.balances(account).delete();
    this.vendors(account).delete();
  }

  @baremethod({ allowActions: "UpdateApplication" })
  public onUpdate() {
    assert(
      Txn.sender === Global.creatorAddress,
      "only admin can update the contract",
    );
  }

  @baremethod({ allowActions: "DeleteApplication" })
  public onDelete() {
    assert(
      Txn.sender === Global.creatorAddress,
      "only admin can delete the contract",
    );
    itxn
      .payment({
        receiver: Txn.sender,
        amount: 0,
        closeRemainderTo: Txn.sender,
      })
      .submit();
  }
}
