import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, agentDecisionsTable } from "@workspace/db";
import {
  ListAgentDecisionsResponse,
  ListAgentDecisionsResponseItem,
  CreateAgentDecisionBody,
  GetAgentStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// In-memory agent state — starts stopped so START is usable
let agentState: "running" | "paused" | "stopped" = "stopped";
let agentStartedAt: number | null = null;

router.get("/agent/decisions", async (req, res): Promise<void> => {
  const limit = Number(req.query["limit"] ?? 20);

  const decisions = await db
    .select()
    .from(agentDecisionsTable)
    .orderBy(desc(agentDecisionsTable.createdAt))
    .limit(limit);

  const serialized = decisions.map((d) => ({
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

router.get("/agent/status", async (_req, res): Promise<void> => {
  const uptime =
    agentState === "running" && agentStartedAt !== null
      ? Math.floor((Date.now() - agentStartedAt) / 1000)
      : 0;

  const status = {
    status: agentState,
    strategy: "momentum",
    uptime,
    krakenConnected: true,
    web3Connected: !!process.env["CONTRACT_ADDRESS"],
    contractAddress: process.env["CONTRACT_ADDRESS"] ?? null,
    network: process.env["CHAIN_NETWORK"] ?? "anvil-local",
  };
  res.json(GetAgentStatusResponse.parse(status));
});

const VALID_STATES = ["running", "paused", "stopped"] as const;
type AgentStateType = (typeof VALID_STATES)[number];

router.patch("/agent/status", (req, res): void => {
  const requested = req.body?.status;
  if (!VALID_STATES.includes(requested)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATES.join(", ")}` });
    return;
  }

  const prev = agentState;
  agentState = requested as AgentStateType;

  if (agentState === "running" && prev !== "running") {
    agentStartedAt = Date.now();
  } else if (agentState === "stopped") {
    agentStartedAt = null;
  }

  const uptime =
    agentState === "running" && agentStartedAt !== null
      ? Math.floor((Date.now() - agentStartedAt) / 1000)
      : 0;

  res.json(
    GetAgentStatusResponse.parse({
      status: agentState,
      strategy: "momentum",
      uptime,
      krakenConnected: true,
      web3Connected: !!process.env["CONTRACT_ADDRESS"],
      contractAddress: process.env["CONTRACT_ADDRESS"] ?? null,
      network: process.env["CHAIN_NETWORK"] ?? "anvil-local",
    }),
  );
});

export default router;
