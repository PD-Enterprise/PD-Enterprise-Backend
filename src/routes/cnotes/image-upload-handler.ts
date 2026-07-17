import { Context } from "hono";
import { createNotesDb } from "@/db/cnotes";
import { images } from "@/drizzle/cnotes/schema";
import { userExistsInNotesDB } from "@/src/routes/user-management/utils/userExists";
import { returnJson } from "@/utils/returnJson";

async function generateCloudinarySignature(
  params: Record<string, string>,
  apiSecret: string,
): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const sortedParams = sortedKeys.map((key) => `${key}=${params[key]}`).join("&");
  const stringToSign = sortedParams + apiSecret;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(apiSecret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(stringToSign));

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function handleImageUpload(c: Context): Promise<Response> {
  const userObj = c.get("user");
  if (userObj === undefined) {
    c.status(401);
    return c.json(returnJson(401, "Unauthorized: No session token found", null, null), 401);
  }

  const body = await c.req.parseBody();
  const imageFile = body["image"] as File | undefined;
  const publicId = body["publicId"] as string | undefined;

  if (!imageFile || !publicId) {
    c.status(400);
    return c.json(returnJson(400, "Missing required fields: image and publicId", null, null));
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const paramsToSign: Record<string, string> = {
    public_id: publicId,
    timestamp,
  };

  const signature = await generateCloudinarySignature(
    paramsToSign,
    c.env.CLOUDINARY_API_SECRET,
  );

  const uploadFormData = new FormData();
  uploadFormData.append("file", imageFile);
  uploadFormData.append("public_id", publicId);
  uploadFormData.append("api_key", c.env.CLOUDINARY_API_KEY);
  uploadFormData.append("timestamp", timestamp);
  uploadFormData.append("signature", signature);

  let cloudinaryResult: any;
  try {
    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${c.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: uploadFormData },
    );
    cloudinaryResult = await uploadRes.json();
    if (!uploadRes.ok) {
      console.error("Cloudinary upload failed", cloudinaryResult);
      c.status(502);
      return c.json(returnJson(502, "Image upload to Cloudinary failed", null, cloudinaryResult));
    }
  } catch (error) {
    console.error("Cloudinary upload error", error);
    c.status(502);
    return c.json(returnJson(502, "Image upload to Cloudinary failed", null, null));
  }

  const notesdb = createNotesDb(c.env.CNOTES_DB_URL);
  const userId = await userExistsInNotesDB(notesdb, userObj.email);
  if (!userId || userId instanceof Error) {
    c.status(401);
    return c.json(returnJson(401, "User not found in database", null, null));
  }

  const today = new Date().toISOString().split("T")[0];
  try {
    await notesdb.insert(images).values({
      publicId: cloudinaryResult.public_id,
      url: cloudinaryResult.secure_url,
      userId,
      dateCreated: today,
    });
  } catch (error) {
    console.error("Database insert error", error);
    c.status(500);
    return c.json(returnJson(500, "Failed to save image record", null, null));
  }

  c.status(200);
  return c.json(returnJson(200, "Image uploaded successfully", { url: cloudinaryResult.secure_url }, null));
}
