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
  let algorand: AlgorandClient;
  let adminClient: PaymentsAdminClient;
  let userClient: PaymentsUserClient;
  let zeroAlgoSender: SendingAddress;
  let zeroAlgoReceiver: SendingAddress;

  beforeAll(async () => {
    algorand = AlgorandClient.defaultLocalNet();
    const admin = await algorand.account.dispenserFromEnvironment();
    adminClient = await PaymentsAdminClient.create({
      algorand,
      admin,
      supply: 1000n,
      prefundAccounts: BigInt(MULTI_XFER_PAYMENTS * 2 + 2),
      prefundTransactions: BigInt(MULTI_XFER_PAYMENTS + 1),
    });
    zeroAlgoSender = algorand.account.random();
    zeroAlgoReceiver = algorand.account.random();

    await adminClient.instantiateAccount(zeroAlgoSender);
    await adminClient.instantiateAccount(zeroAlgoReceiver);
    await adminClient.addToCirculation(100n, zeroAlgoSender);

    userClient = new PaymentsUserClient(algorand, adminClient.appClient.appId);
  });

  it("payment", async () => {
    expect(await userClient.balance(zeroAlgoSender)).toBe(100n);
    expect(await userClient.balance(zeroAlgoReceiver)).toBe(0n);

    const senderPreAlgo = await getAlgoBalance(algorand, zeroAlgoSender);
    const receiverPreAlgo = await getAlgoBalance(algorand, zeroAlgoReceiver);

    expect(senderPreAlgo).toBe(0n);
    expect(receiverPreAlgo).toBe(0n);

    await userClient.transfer(zeroAlgoSender, zeroAlgoReceiver, 10n);

    const senderPostAlgo = await getAlgoBalance(algorand, zeroAlgoSender);
    const receiverPostAlgo = await getAlgoBalance(algorand, zeroAlgoReceiver);

    expect(senderPostAlgo).toBe(0n);
    expect(receiverPostAlgo).toBe(0n);

    expect(await userClient.balance(zeroAlgoSender)).toBe(90n);
    expect(await userClient.balance(zeroAlgoReceiver)).toBe(10n);
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
  });
});
