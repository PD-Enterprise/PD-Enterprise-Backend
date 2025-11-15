import { Hono } from "hono";
import { returnJson } from "../../utils/returnJson";

const root = new Hono();

root.get("/", (c) => {
  c.status(200);
  return c.html("<h1>This is the backend-service for PD Enterprise.</h1>");
});

root.post("/", (c) => {
  c.status(200);
  const returnData = returnJson(
    200,
    "This is the backend-service for PD Enterprise.",
    null,
    null
  );
  return c.json(returnData);
});
