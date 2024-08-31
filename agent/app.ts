import { AES, enc } from "crypto-js";

const message = "Hello, world!";

const passphrase = "123456";

const encrypted = AES.encrypt(message, passphrase).toString();
console.log("enc", encrypted);

const decrypted = AES.decrypt(encrypted, passphrase).toString(enc.Utf8);
console.log("dec", decrypted);

console.log("Hello, world!");

console.log(await fetch("https://myip.ipip.net").then((res) => res.text()));
