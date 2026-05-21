import express, { Request, Response, Router } from "express";
import { loggers } from "../utils/logger";
import { ZEN_PATHS } from "../utils/zen-paths";
import { adminAuthMiddleware } from "../middleware/admin-auth";

const router: Router = express.Router();

// Middleware per ottenere l'istanza Gun/ZEN dal relay
const getZenInstance = (req: Request): any => {
  return req.app.get("zenInstance") || req.app.get("zenInstance");
};



// Test Gun operations endpoint
router.get("/test-gun", adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const gun = getZenInstance(req);

    loggers.server.debug("🧪 Testing Gun operations");

    const testData = {
      test: true,
      timestamp: Date.now(),
      message: "Gun test successful",
    };

    const testNode = gun.get(ZEN_PATHS.TEST);

    const writeTest = () => {
      return new Promise((resolve, reject) => {
        testNode.put(testData, (ack: any) => {
          if (ack && ack.err) {
            reject(new Error(ack.err));
          } else {
            resolve("Write successful");
          }
        });
      });
    };

    const readTest = () => {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("Read timeout"));
        }, 10000);

        testNode.once((data: any) => {
          clearTimeout(timeoutId);
          if (data && data.test) {
            resolve(data);
          } else {
            reject(new Error("Invalid test data"));
          }
        });
      });
    };

    // Perform write test
    await writeTest();
    loggers.server.debug("✅ Write test passed");

    // Perform read test
    const readData = await readTest();
    loggers.server.debug("✅ Read test passed");

    res.json({
      success: true,
      message: "Gun operations test successful",
      writeTest: "passed",
      readTest: "passed",
      readData,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    loggers.server.error({ err: error }, "❌ Gun test error");
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Gun operations test failed",
    });
  }
});

// Test Gun save endpoint
router.get(
  "/test-gun-save/:identifier/:hash",
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { identifier, hash } = req.params;
      const gun = getZenInstance(req);

      loggers.server.debug({ identifier, hash }, `🧪 Testing Gun save`);

      const testData = {
        hash: hash,
        name: "test-file.txt",
        size: 1024,
        sizeMB: 1,
        uploadedAt: Date.now(),
        test: true,
      };

      const testNode = gun.get(ZEN_PATHS.UPLOADS).get(identifier).get(hash);

      const writeTest = () => {
        return new Promise((resolve, reject) => {
          testNode.put(testData, (ack: any) => {
            if (ack && ack.err) {
              reject(new Error(ack.err));
            } else {
              resolve("Write successful");
            }
          });
        });
      };

      const readTest = () => {
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error("Read timeout"));
          }, 10000);

          testNode.once((data: any) => {
            clearTimeout(timeoutId);
            if (data && data.hash === hash) {
              resolve(data);
            } else {
              reject(new Error("Invalid test data"));
            }
          });
        });
      };

      // Perform write test
      await writeTest();
      loggers.server.debug("✅ Write test passed");

      // Perform read test
      const readData = await readTest();
      loggers.server.debug("✅ Read test passed");

      res.json({
        success: true,
        message: "Gun save test successful",
        identifier,
        hash,
        writeTest: "passed",
        readTest: "passed",
        readData,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      loggers.server.error({ err: error }, "❌ Gun save test error");
      res.status(500).json({
        success: false,
        error: error.message,
        message: "Gun save test failed",
      });
    }
  }
);



export default router;
