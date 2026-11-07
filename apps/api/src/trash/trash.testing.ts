import { TrashRepository } from "./trash.repository";

/**
 * For specs of services whose delete moves a row to the trash: records the call and does
 * nothing else. A spec that checks the delete reads `TRASH_SOFT_DELETE.mock.calls`.
 */
export const TRASH_SOFT_DELETE = jest.fn().mockResolvedValue({});

export const RECORDING_TRASH = {
  provide: TrashRepository,
  useValue: { softDelete: TRASH_SOFT_DELETE }
};
