import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import suppliersRouter from "./suppliers";
import purchasesRouter from "./purchases";
import lotsRouter from "./lots";
import clientsRouter from "./clients";
import salesRouter from "./sales";
import accountingRouter from "./accounting";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(suppliersRouter);
router.use(purchasesRouter);
router.use(lotsRouter);
router.use(clientsRouter);
router.use(salesRouter);
router.use(accountingRouter);
router.use(dashboardRouter);

export default router;
