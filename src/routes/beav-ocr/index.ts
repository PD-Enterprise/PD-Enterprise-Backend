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
import { toUserFacingError } from "@/src/utils/sanitizeError";

const ocrRouter = new Hono<{ Bindings: Bindings }>();

ocrRouter.post("/upload",
    bodyLimit({
        maxSize: 20 * 1024 * 1024, // 20 MB
        onError: (c) => {
            return c.json(returnJson(413, "File must be below 20MB.", null, "File too large."))
        }
    }),
    async (c) => {
        const body = await c.req.parseBody();
        const file = body['file'];
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

        if (!(file instanceof File)) {
            c.status(400);
            return c.json(returnJson(400, "Input is not a file.", null, "File not found."));
        }
        if (!allowedTypes.includes(file.type)) {
            c.status(400);
            return c.json(returnJson(400, "Only JPEG, PNG, and WebP files are allowed.", null, "Invalid file type."));
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
                    console.error("[beav-ocr] OCR stream failed:", err?.message ?? err);
                    controller.enqueue(
                        encode(formatNDJSONError(toUserFacingError(err, "ocr"))),
                    );
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, { headers: NDJSON_HEADERS });
    })

export default ocrRouter;
