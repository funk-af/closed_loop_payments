import { beforeAll, describe, expect, it } from "vitest";
import { PaymentsAdminClient, PaymentsUserClient } from "../src";
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

describe("Payments", () => {
  let algorand: AlgorandClient;
  let userClient: PaymentsUserClient;
  let zeroAlgoSender: SendingAddress;
  let zeroAlgoReceiver: SendingAddress;

  beforeAll(async () => {
    algorand = AlgorandClient.defaultLocalNet();
    const admin = await algorand.account.dispenserFromEnvironment();
    const adminClient = await PaymentsAdminClient.create({
      algorand,
      admin,
      supply: 200n,
      prefundAccounts: 2n,
      prefundTransactions: 1n,
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
});
