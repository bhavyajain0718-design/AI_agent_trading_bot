import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tradesRouter from "./trades";
import portfolioRouter from "./portfolio";
import agentRouter from "./agent";
import chainRouter from "./chain";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tradesRouter);
router.use(portfolioRouter);
router.use(agentRouter);
router.use(chainRouter);

export default router;
