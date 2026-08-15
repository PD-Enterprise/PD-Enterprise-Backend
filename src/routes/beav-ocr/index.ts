import { Hono } from "hono";
import { Bindings } from "../../types";
import { returnJson } from "@/src/utils/returnJson";
import { bodyLimit } from "hono/body-limit";
import { generateOCR } from "./utils/OCR";
import {
  NDJSON_HEADERS,
  formatNDJSONChunk,
  formatNDJSONDone,
  formatNDJSONError,
} from "@/src/utils/stream-utils";

const ocrRouter = new Hono<{ Bindings: Bindings }>();

ocrRouter.post("/upload",
    bodyLimit({
        maxSize: 9 * 1024 * 1024, // 9 MB
        onError: (c) => {
            return c.json(returnJson(413, "File must be below 9MB.", null, "File too large."))
        }
    }),
    async (c) => {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!(file instanceof File)) {
            c.status(400);
            return c.json(returnJson(400, "Input is not a file.", null, "File not found."));
        }

        const stream = new ReadableStream({
            async start(controller) {
                const encode = (str: string) => new TextEncoder().encode(str);

                try {
                    for await (const chunk of generateOCR(c.env.GEMINI_OCR_API_KEY, file)) {
                        controller.enqueue(encode(formatNDJSONChunk(chunk)));
                    }
                    controller.enqueue(encode(formatNDJSONDone()));
                } catch (err: any) {
                    controller.enqueue(encode(formatNDJSONError(err.message)));
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, { headers: NDJSON_HEADERS });
    })

export default ocrRouter;
