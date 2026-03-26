import { SendingAddress } from "@algorandfoundation/algokit-utils/transact";
import {
  PaymentsClient as PaymentsAppClient,
  PaymentsFactory,
} from "../contracts/clients/PaymentsClient";
import {
  AlgorandClient,
  getAddress,
  microAlgos,
  ReadableAddress,
} from "@algorandfoundation/algokit-utils";

const ACCOUNT_BOX_MBR = 18_900n;

export type Transfer = {
  receiver: ReadableAddress;
  amount: bigint;
};

export class PaymentsAdminClient {
  appClient: PaymentsAppClient;
  admin: SendingAddress;

  constructor(algorand: AlgorandClient, appId: bigint, admin: SendingAddress) {
    this.appClient = algorand.client.getTypedAppClientById(PaymentsAppClient, {
      appId,
    });

    this.admin = admin;
  }

  static async create({
    algorand,
    admin,
    supply,
    prefundAccounts,
    prefundTransactions,
  }: {
    algorand: AlgorandClient;
    admin: SendingAddress;
    supply: bigint;
    prefundAccounts: bigint;
    prefundTransactions: bigint;
  }) {
    const factory = algorand.client.getTypedAppFactory(PaymentsFactory, {});

    const result = await factory.send.create.createApplication({
      sender: admin,
      args: { supply },
    });

    await algorand.send.payment({
      sender: admin,
      receiver: result.appClient.appAddress,
      amount: microAlgos(
        200_000n +
          ACCOUNT_BOX_MBR * prefundAccounts +
          3_000n * prefundTransactions,
      ),
    });

    return new PaymentsAdminClient(algorand, result.appClient.appId, admin);
  }

  async addToCirculation(amount: bigint, receiver: ReadableAddress) {
    return await this.appClient.send.addToCirculation({
      sender: this.admin,
      args: { amount, receiver: getAddress(receiver).toString() },
    });
  }

  async instantiateAccount(account: ReadableAddress) {
    return await this.appClient.send.instantiateAccount({
      sender: this.admin,
      args: { account: getAddress(account).toString() },
    });
  }

  async instantiateAccounts(accounts: ReadableAddress[]) {
    return await this.appClient.send.instantiateAccounts({
      sender: this.admin,
      args: {
        accounts: accounts.map((account) => getAddress(account).toString()),
      },
    });
  }
}

export class PaymentsUserClient {
  appClient: PaymentsAppClient;

  constructor(algorand: AlgorandClient, appId: bigint) {
    this.appClient = algorand.client.getTypedAppClientById(PaymentsAppClient, {
      appId,
    });
  }

  async transfer(
    sender: SendingAddress,
    receiver: ReadableAddress,
    amount: bigint,
  ) {
    const group = this.appClient.newGroup();

    group.transfer({
      sender,
      staticFee: microAlgos(0),
      args: {
        sender: getAddress(sender).toString(),
        receiver: getAddress(receiver).toString(),
        amount,
      },
    });

    group.addTransaction(
      await this.appClient.algorand.createTransaction.payment({
        sender,
        staticFee: microAlgos(3_000),
        receiver: this.appClient.appAddress,
        amount: microAlgos(0),
        closeRemainderTo: this.appClient.appAddress,
      }),
    );

    await group.send();
  }

  async multiTransfer(sender: SendingAddress, transfers: Transfer[]) {
    const group = this.appClient.newGroup();

    group.multiTransfer({
      staticFee: microAlgos(0n),
      sender,
      args: {
        transfers: transfers.map((t) => [
          getAddress(t.receiver).toString(),
          t.amount,
        ]),
      },
    });

    group.addTransaction(
      await this.appClient.algorand.createTransaction.payment({
        sender,
        staticFee: microAlgos(3_000),
        receiver: this.appClient.appAddress,
        amount: microAlgos(0),
        closeRemainderTo: this.appClient.appAddress,
      }),
    );

    await group.send();
  }

  async balance(account: ReadableAddress) {
    return this.appClient.state.box.balances.value(
      getAddress(account).toString(),
    );
  }
}
