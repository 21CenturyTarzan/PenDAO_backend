import { FastifyPluginAsync } from "fastify";
import admin from "firebase-admin";
import { recoverPersonalSignature } from "eth-sig-util";
import Web3 from "web3";
import serviceAccount from "../../config/serviceAccountKey.json";

admin.initializeApp({
  // @ts-ignore
  credential: admin.credential.cert(serviceAccount),
});

const isValidEthAddress = (address) => Web3.utils.isAddress(address);

const makeId = (length) => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
};

const isValidSignature = (address, signature, messageToSign) => {
  if (!address || typeof address !== "string" || !signature || !messageToSign) {
    return false;
  }

  const signingAddress = recoverPersonalSignature({
    data: messageToSign,
    sig: signature,
  });

  if (!signingAddress || typeof signingAddress !== "string") {
    return false;
  }

  return signingAddress.toLowerCase() === address.toLowerCase();
};

const firebase: FastifyPluginAsync = async (fastify, _opts): Promise<void> => {
  fastify.get("/jwt", async function (_request, reply) {
    try {
      const { address, signature } = _request.query as any;

      if (!isValidEthAddress(address) || !signature) {
        return reply.send({ error: "invalid_parameters" });
      }

      const [customToken, doc] = await Promise.all([
        admin.auth().createCustomToken(address),
        admin.firestore().collection("users").doc(address).get(),
      ]);

      if (!doc.exists) {
        return reply.send({ error: "invalid_message_to_sign" });
      }

      const { messageToSign } = doc.data();

      if (!messageToSign) {
        return reply.send({ error: "invalid_message_to_sign" });
      }

      const validSignature = isValidSignature(address, signature, messageToSign);

      if (!validSignature) {
        return reply.send({ error: "invalid_signature" });
      }

      // Delete messageToSign as it is for 1 time use only
      admin.firestore().collection("users").doc(address).set(
        {
          messageToSign: null,
        },
        {
          merge: true,
        }
      );

      return reply.send({ customToken, error: null });
    } catch (error) {
      console.log(error);
      return reply.send({ error: "server_error" });
    }
  });

  fastify.get("/message", async function (_request, reply) {
    try {
      const { address } = _request.query as any;

      if (!isValidEthAddress(address)) {
        return reply.send({ error: "invalid_address" });
      }

      const randomString = makeId(20);
      let messageToSign = `Metamask address: ${address} Nonce: ${randomString}`;

      const user = await admin.firestore().collection("users").doc(address).get();

      if (user.data() && user.data().messageToSign) {
        messageToSign = user.data().messageToSign;
      } else {
        admin.firestore().collection("users").doc(address).set(
          {
            messageToSign,
          }
        );
      }

      return reply.send({ messageToSign, error: null });
    } catch (error) {
      console.log(error);
      return reply.send({ error: "server_error" });
    }
  });
};

export default firebase;
