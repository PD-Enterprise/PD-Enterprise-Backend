export function returnJson(
  status: number,
  message: string,
  data: any,
  error: any
) {
  return {
    status: status,
    message: message,
    data: data,
    error: error,
  };
}
