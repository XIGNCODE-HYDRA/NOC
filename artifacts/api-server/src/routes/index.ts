import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import devicesRouter from "./devices";
import interfacesRouter from "./interfaces";
import bandwidthRouter from "./bandwidth";
import dashboardRouter from "./dashboard";
import pingRouter from "./ping";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(devicesRouter);
router.use(interfacesRouter);
router.use(bandwidthRouter);
router.use(dashboardRouter);
router.use(pingRouter);

export default router;
