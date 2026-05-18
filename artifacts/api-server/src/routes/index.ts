import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import devicesRouter from "./devices";
import interfacesRouter from "./interfaces";
import bandwidthRouter from "./bandwidth";
import dashboardRouter from "./dashboard";
import pingRouter from "./ping";
import netwatchRouter from "./netwatch";
import eventsRouter from "./events";
import usersRouter from "./users";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(devicesRouter);
router.use(interfacesRouter);
router.use(bandwidthRouter);
router.use(dashboardRouter);
router.use(pingRouter);
router.use(netwatchRouter);
router.use(eventsRouter);
router.use(usersRouter);
router.use(settingsRouter);

export default router;
