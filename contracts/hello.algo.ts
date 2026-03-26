import { Contract } from "@algorandfoundation/algorand-typescript";

export class HelloWorld extends Contract {
  hello() {
    return "Hello, world!";
  }
}
