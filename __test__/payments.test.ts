import { beforeAll, describe, expect, it } from "vitest";
import { PaymentsAdminClient, PaymentsUserClient, Transfer } from "../src";
import {
  AlgorandClient,
  ReadableAddress,
} from "@algorandfoundation/algokit-utils";
import { SendingAddress } from "@algorandfoundation/algokit-utils/transact";

async function getAlgoBalance(
  algorand: AlgorandClient,
  account: ReadableAddress,
): Promise<bigint> {
  const { amount } = await algorand.client.algod.accountInformation(account);
  return amount;
}

const MULTI_XFER_PAYMENTS = 7;

describe("Payments", () => {
  // Client used to form transactions and interact with the network
  let algorand: AlgorandClient;

  // Clients used to interact with our payments app
  let adminClient: PaymentsAdminClient;
  let userClient: PaymentsUserClient;

  // Two accounts with no ALGO
  let zeroAlgoSender: SendingAddress;
  let zeroAlgoReceiver: ReadableAddress;

  beforeAll(async () => {
    algorand = AlgorandClient.defaultLocalNet();
    const admin = await algorand.account.dispenserFromEnvironment();
    adminClient = await PaymentsAdminClient.create({
      algorand,
      admin,
      supply: 1000n,
      allowP2P: true,
      // pre-fund the app for all the account we will use in the tests
      prefundAccounts: BigInt(MULTI_XFER_PAYMENTS + 3),
      // pre-fund the app for all transactions we will send in the tests
      prefundTransactions: BigInt(2),
    });

    // Generate two random accounts, neither of which have any ALGO
    zeroAlgoSender = algorand.account.random();
    zeroAlgoReceiver = algorand.account.random();

    // Instantiate their account in the contract (creates their necessary boxes)
    await adminClient.instantiateAccount(zeroAlgoSender);
    await adminClient.instantiateAccount(zeroAlgoReceiver);

    // Give 100 of our "token" to the zeroAlgoSender
    await adminClient.addToCirculation(100n, zeroAlgoSender);

    userClient = new PaymentsUserClient(algorand, adminClient.appClient.appId);
  });

  it("payment", async () => {
    // Make sure our token balances are as expected (100 for sender, 0 for receiver)
    expect(await userClient.balance(zeroAlgoSender)).toBe(100n);
    expect(await userClient.balance(zeroAlgoReceiver)).toBe(0n);

    // Make sure the accounts indeed have 0 ALGO
    const senderPreAlgo = await getAlgoBalance(algorand, zeroAlgoSender);
    const receiverPreAlgo = await getAlgoBalance(algorand, zeroAlgoReceiver);
    expect(senderPreAlgo).toBe(0n);
    expect(receiverPreAlgo).toBe(0n);

    // Perform the transfer and verify token balances are updated
    await userClient.transfer(zeroAlgoSender, zeroAlgoReceiver, 10n);
    expect(await userClient.balance(zeroAlgoSender)).toBe(90n);
    expect(await userClient.balance(zeroAlgoReceiver)).toBe(10n);

    // Verify both accounts still have 0 ALGO
    const senderPostAlgo = await getAlgoBalance(algorand, zeroAlgoSender);
    const receiverPostAlgo = await getAlgoBalance(algorand, zeroAlgoReceiver);
    expect(senderPostAlgo).toBe(0n);
    expect(receiverPostAlgo).toBe(0n);
  });

  it(`${MULTI_XFER_PAYMENTS} payments in one transaction`, async () => {
    const sender = algorand.account.random();
    await adminClient.instantiateAccount(sender);

    await adminClient.addToCirculation(BigInt(MULTI_XFER_PAYMENTS), sender);
    const receivers = Array.from({ length: MULTI_XFER_PAYMENTS }, () =>
      algorand.account.random(),
    );

    await adminClient.instantiateAccounts(receivers);

    const transfers: Transfer[] = [];
    for (let i = 0; i < MULTI_XFER_PAYMENTS; i++) {
      transfers.push({
        receiver: receivers[i],
        amount: 1n,
      });
    }

    await userClient.multiTransfer(sender, transfers);

    expect(await getAlgoBalance(algorand, sender)).toBe(0n);
    expect(await userClient.balance(sender)).toBe(0n);

    for (const receiver of receivers) {
      expect(await userClient.balance(receiver)).toBe(1n);
      expect(await getAlgoBalance(algorand, receiver)).toBe(0n);
    }
  });
});
