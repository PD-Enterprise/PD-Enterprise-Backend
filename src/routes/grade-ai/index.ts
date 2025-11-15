import { Hono } from "hono";
import Groq from "groq-sdk";
import { z } from "zod";

const aiRouter = new Hono();

let chatHistory: any = [];
const initial_socratic_message = {
  role: "user",
  content: `You are a Socratic Teacher. And I am your student. And please try to keep your replies as brief as possible, while explaining each topic carefully. Please Explain the topic in relation to the NCERT CBSE 2024 curriculum. Please don't give the answer directly but rather a starting point to get started, your job is to help the student find the answer in his/her own way.
Also please return your answer in HTML format, with proper tags.`,
};
const initial_message = {
  role: "user",
  content: `Please return your answer in HTML format, with proper tags, only send inside the <body> tags, no need for the boilerplate or <body> tag.
        always return your whole answer strictly in the following json syntax: {summary: "[a short summary in a few words of the prompt"]", content: "[your response]"}`,
};
let chatCompletion: any;

const chatSchema = z.object({
  prompt: z.string().min(1).max(2000).trim(),
  modalParams: z.any(), // Adjust as needed
});

async function chatWithHistory(
  userMessage: string,
  modal: string,
  groq: any,
  modalParams: any
) {
  chatHistory = [...chatHistory, { role: "user", content: userMessage }];
  if (modalParams.type == "custom") {
    chatCompletion = await groq.chat.completions.create({
      messages: [...chatHistory, initial_socratic_message],
      model: modal,
    });
  } else if (modalParams.type == "direct") {
    chatCompletion = await groq.chat.completions.create({
      messages: [...chatHistory, initial_message],
      model: modal,
    });
  }
  const response = chatCompletion.choices[0]?.message?.content;
  chatHistory = [...chatHistory, { role: "assistant", content: response }];
  return response;
}

aiRouter.post("/chat/:modal", async (c) => {
  // @ts-expect-error
  const apiKey = c.env.GROQ_API_KEY;
  const groq = new Groq({ apiKey });

  const modal = c.req.param("modal");
  const body = await c.req.json();
  const modalParams = body.modalParams;
  if (!body.prompt || !body.modalParams) {
    c.status(400);
    return c.json({
      status: 400,
      message: "Missing required fields",
      data: null,
      error: null,
    });
  }
  const prompt = body.prompt;
  try {
    const chatCompletion = await chatWithHistory(
      prompt,
      modal,
      groq,
      modalParams
    );
    return c.json({
      status: 200,
      message: "Successfully found note",
      data: chatCompletion,
      error: null,
    });
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json({
      status: 500,
      message: "An unexpected error occurred. Please try again later.",
      data: null,
      error: null,
    });
  }
});

export default aiRouter;
