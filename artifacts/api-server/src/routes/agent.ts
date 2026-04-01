import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, agentDecisionsTable } from "@workspace/db";
import {
  ListAgentDecisionsResponse,
  ListAgentDecisionsResponseItem,
  CreateAgentDecisionBody,
  GetAgentStatusResponse,
} from "@workspace/api-zod";
import { agentEngine } from "../lib/agent-engine";
import { checkKrakenConnectivity, checkRpcConnectivity } from "../lib/connectivity";
import { MARKET_TIMEFRAMES, normalizeTimeframe } from "../lib/market-data";

const router: IRouter = Router();

router.get("/agent/decisions", async (req, res): Promise<void> => {
  const limit = Number(req.query["limit"] ?? 20);
  const requestedWalletAddress =
    typeof req.query["walletAddress"] === "string" ? req.query["walletAddress"].toLowerCase() : undefined;

  const decisions = requestedWalletAddress
    ? await db
        .select()
        .from(agentDecisionsTable)
        .where(eq(agentDecisionsTable.walletAddress, requestedWalletAddress))
        .orderBy(desc(agentDecisionsTable.createdAt))
        .limit(limit)
    : await db
        .select()
        .from(agentDecisionsTable)
        .orderBy(desc(agentDecisionsTable.createdAt))
        .limit(limit);

  const serialized = decisions.map((d: (typeof decisions)[number]) => ({
    ...d,
    createdAt: d.createdAt.toISOString(),
  }));

  res.json(ListAgentDecisionsResponse.parse(serialized));
});

router.post("/agent/decisions", async (req, res): Promise<void> => {
  const parsed = CreateAgentDecisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [decision] = await db
    .insert(agentDecisionsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(ListAgentDecisionsResponseItem.parse(decision));
});

router.get("/agent/status", async (req, res): Promise<void> => {
  const runtime = agentEngine.getStatus();
  const requestedWalletAddress =
    typeof req.query["walletAddress"] === "string" ? req.query["walletAddress"].toLowerCase() : undefined;
  const [krakenConnected, web3Connected] = await Promise.all([
    checkKrakenConnectivity(),
    checkRpcConnectivity(),
  ]);
  const matchesWallet =
    !requestedWalletAddress ||
    (runtime.activeWalletAddress !== null && runtime.activeWalletAddress === requestedWalletAddress);
  const status = {
    status: matchesWallet ? runtime.status : "stopped",
    strategy: runtime.strategy,
    uptime: matchesWallet ? runtime.uptime : 0,
    krakenConnected: matchesWallet ? (krakenConnected || runtime.krakenConnected) : false,
    web3Connected,
    contractAddress: process.env["CONTRACT_ADDRESS"] ?? null,
    network: process.env["CHAIN_NETWORK"] ?? "anvil-local",
  };
  res.json(GetAgentStatusResponse.parse(status));
});

router.get("/agent/config", (_req, res): void => {
  const runtime = agentEngine.getStatus();

  res.json({
    timeframe: runtime.timeframe,
    availableTimeframes: Object.entries(MARKET_TIMEFRAMES).map(([key, value]) => ({
      key,
      label: value.label,
    })),
  });
});

const VALID_STATES = ["running", "paused", "stopped"] as const;
type AgentStateType = (typeof VALID_STATES)[number];

router.patch("/agent/status", async (req, res): Promise<void> => {
  const requested = req.body?.status;
  const requestedWalletAddress =
    typeof req.body?.walletAddress === "string" ? req.body.walletAddress : undefined;
  const requestedTimeframe = normalizeTimeframe(
    typeof req.body?.timeframe === "string" ? req.body.timeframe : undefined,
  );
  if (!VALID_STATES.includes(requested)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATES.join(", ")}` });
    return;
  }

  if (requested === "running" && !requestedWalletAddress && !agentEngine.getStatus().activeWalletAddress) {
    res.status(400).json({ error: "walletAddress is required when starting the agent" });
    return;
  }

  agentEngine.setActiveWalletAddress(requestedWalletAddress);
  agentEngine.setState(requested as AgentStateType);
  agentEngine.setTimeframe(requestedTimeframe);
  const runtime = agentEngine.getStatus();
  const [krakenConnected, web3Connected] = await Promise.all([
    checkKrakenConnectivity(),
    checkRpcConnectivity(),
  ]);

  res.json(
    GetAgentStatusResponse.parse({
      status: runtime.status,
      strategy: runtime.strategy,
      uptime: runtime.uptime,
      krakenConnected: krakenConnected || runtime.krakenConnected,
      web3Connected,
      contractAddress: process.env["CONTRACT_ADDRESS"] ?? null,
      network: process.env["CHAIN_NETWORK"] ?? "anvil-local",
    }),
  );
});

export default router;
