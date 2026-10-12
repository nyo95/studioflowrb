import "server-only";

import { prisma } from "@platform/runtime";
import { createStudioFlowPresentationBridge } from "./presentation-bridge";

export const studioFlowPresentationBridge = createStudioFlowPresentationBridge(prisma);
