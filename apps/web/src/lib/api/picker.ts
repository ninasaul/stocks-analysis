/** Placeholder for dialogue session API (7.6). Client state machine fills this role today. */

export type PickerTurnRequest = {
  session_id: string;
  text?: string;
  action_id?: string;
};

export type PickerTurnResponse = {
  ok: boolean;
};

/** Replace with POST /picker/turn when backend is available. */
export async function requestPickerTurn(req: PickerTurnRequest): Promise<PickerTurnResponse> {
  void req;
  await new Promise((r) => setTimeout(r, 1));
  return { ok: true };
}
