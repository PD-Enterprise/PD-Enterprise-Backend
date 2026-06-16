import { Hono } from "hono"
import { AppVariables, Bindings } from "../../types";

const folderRouter = new Hono<{ Bindings: Bindings, Variables: AppVariables }>();

/**
 * Create folder
 * POST /cnotes/folder/new-folder
 * Requires: email
 * Returns: JSON
 */
folderRouter.post()

/**
 * Get folder
 * GET /cnotes/folder/get-folder
 * Requires: email
 * Returns: JSON
 */
folderRouter.get()

/**
 * Update folder
 * PATCH /cnotes/folder/update-folder
 * Requires: email
 * Returns: JSON
 */
folderRouter.patch()

/**
 * Delete folder
 * DELETE /cnotes/folder/delete-folder
 * Requires: email
 * Returns: JSON
 */
folderRouter.delete()

export default folderRouter