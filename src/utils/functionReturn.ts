import { functionReturn } from "../types";

export function functionReturn(
  successState: boolean,
  errorState: boolean,
  message: string,
  data: any = null,
  error: any = null,
): functionReturn {
  return [successState, errorState, message, data, error];
}
