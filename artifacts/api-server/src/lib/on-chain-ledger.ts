import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db, onChainTradeEventsTable } from "@workspace/db";
import { normalizeWalletAddress } from "./trade-wallet";

const execFileAsync = promisify(execFile);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type LifecyclePhase = "open" | "close" | "settle";

function toScaledInt(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return Math.round(numeric * 1e8).toString();
}

function normalizePrivateKey(privateKey: string) {
  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
}

export async function recordTradeLifecycleOnChain(input: {
  tradeId: number;
  phase: LifecyclePhase;
  symbol: string;
  side: string;
  price: string | number;
  quantity: string | number;
  pnl: string | number;
  walletAddress?: string | null;
}) {
  const rpcUrl = process.env["RPC_URL"];
  const contractAddress = process.env["CONTRACT_ADDRESS"];
  const privateKey = process.env["DEPLOYER_PRIVATE_KEY"];
  const network = process.env["CHAIN_NETWORK"] ?? "sepolia";

  if (!rpcUrl || !contractAddress || !privateKey) {
    throw new Error("RPC_URL, CONTRACT_ADDRESS, and DEPLOYER_PRIVATE_KEY are required for on-chain lifecycle recording.");
  }

  const normalizedWallet = normalizeWalletAddress(input.walletAddress) ?? ZERO_ADDRESS;
  const args = [
    "send",
    "--async",
    "--rpc-url",
    rpcUrl,
    "--private-key",
    normalizePrivateKey(privateKey),
    contractAddress,
    "recordTradeEvent(uint256,string,string,string,int256,int256,int256,address)",
    String(input.tradeId),
    input.phase,
    input.symbol,
    input.side,
    toScaledInt(input.price),
    toScaledInt(input.quantity),
    toScaledInt(input.pnl),
    normalizedWallet,
  ];

  const { stdout } = await execFileAsync("cast", args, {
    cwd: process.cwd(),
    env: process.env,
  });

  const txHash = stdout.trim().split(/\s+/).find((part) => /^0x[a-fA-F0-9]{64}$/.test(part));
  if (!txHash) {
    throw new Error(`Unable to parse transaction hash from cast send output: ${stdout}`);
  }

  await db.insert(onChainTradeEventsTable).values({
    tradeId: input.tradeId,
    phase: input.phase,
    symbol: input.symbol,
    side: input.side,
    price: String(input.price),
    quantity: String(input.quantity),
    pnl: String(input.pnl),
    walletAddress: normalizeWalletAddress(input.walletAddress),
    txHash,
    network,
  });

  return txHash;
}
