import * as dotenv from "dotenv";

import { FastifyPluginAsync } from "fastify";
import { create } from "ipfs-http-client";
import { Wallet, providers, Contract } from "ethers";

import contract from "../../contracts/Contributor.json";

dotenv.config();

const MNEMONIC = process.env.MNEMONIC || "";
const IPFS_API = process.env.IPFS_API;
const API_KEY = process.env.API_KEY;
const NETWORK_NAME = process.env.NETWORK_NAME;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

// @ts-ignore
const client = create(IPFS_API);

const wallet = Wallet.fromMnemonic(MNEMONIC);
const alchemyProvider = new providers.AlchemyProvider(NETWORK_NAME, API_KEY);
const signer = wallet.connect(alchemyProvider);
// @ts-ignore
const Contributor = new Contract(CONTRACT_ADDRESS, contract.abi, signer);

const ipfs: FastifyPluginAsync = async (fastify, _opts): Promise<void> => {
  fastify.get("/", async function (_request, reply) {
    const address = await signer.getAddress();
    const cid = await Contributor.getCid(address);

    reply.send(cid == "" ? "Not a contributor" : { address, cid });
  });

  fastify.delete("/", async function (_request, reply) {
    try {
      await Contributor.connect(signer).removeCid(await signer.getAddress());

      Contributor.on("RemoveCid", (from, event) => {
        reply.send({ contributor: event.args });
      });
    } catch (error) {
      console.error(error);
      reply.send(error);
    }
  });

  fastify.post("/upload", async function (req, reply) {
    const { schedule, created, due, amount, workers, status } = req.body as any;

    const _ipfs = await client.add(JSON.stringify({
      schedule: schedule.value,
      created: created.value,
      due: due.value,
      amount: amount.value,
      workers: workers.value,
      status: status.value,
    }));

    try {
      await Contributor.connect(signer).setCid(await signer.getAddress(), _ipfs.cid.toString());

      Contributor.on("SetCid", (from, to, event) => {
        reply.send({ cid: event.args.cid });
      });
    } catch (error) {
      console.error(error);
      reply.send(error);
    }
  });
};

export default ipfs;
