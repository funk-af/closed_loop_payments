import { SendingAddress } from "@algorandfoundation/algokit-utils/transact";
import {
  HelloWorldClient,
  HelloWorldFactory,
} from "../contracts/clients/HelloWorldClient";
import {
  AlgorandClient,
  ReadableAddress,
} from "@algorandfoundation/algokit-utils";

export class HelloWorld {
  appClient: HelloWorldClient;

  constructor(algorand: AlgorandClient, appId: bigint) {
    this.appClient = algorand.client.getTypedAppClientById(HelloWorldClient, {
      appId,
    });
  }

  static async create(algorand: AlgorandClient, creator: SendingAddress) {
    const factory = algorand.client.getTypedAppFactory(HelloWorldFactory, {});

    const result = await factory.send.create.bare({ sender: creator });

    return new HelloWorld(algorand, result.appClient.appId);
  }

  async hello(sender: SendingAddress): Promise<string> {
    const { return: message } = await this.appClient.send.hello({
      sender,
      args: {},
    });

    if (message === undefined) {
      throw new Error("Contract returned undefined");
    }

    return message;
  }
}
