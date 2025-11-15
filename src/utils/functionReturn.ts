export function functionReturn(
  successState: boolean,
  errorState: boolean,
  message: string
) {
  return [successState, errorState, message];
}
