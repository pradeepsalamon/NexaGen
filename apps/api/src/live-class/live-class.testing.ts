import { LiveClassAccessService } from "./live-class-access.service";
import { LiveClassBoardStateService } from "./live-class-board-state.service";
import { LiveClassChatService } from "./live-class-chat.service";
import { LiveClassDemoService } from "./live-class-demo.service";
import { LiveClassModerationService } from "./live-class-moderation.service";
import { LiveClassPullService } from "./live-class-pull.service";
import { LiveClassRecordingService } from "./live-class-recording.service";
import { LiveClassScreenShareService } from "./live-class-screen-share.service";
import { LiveClassSpectateService } from "./live-class-spectate.service";
import { LiveClassWaitingRoomService } from "./live-class-waiting-room.service";
import { LiveClassService } from "./live-class.service";
import { GameRecorderService } from "../game-library/game-recorder.service";
import { UNLIMITED_ENTITLEMENTS } from "../platform/entitlement.testing";

/** Every live-class service, real, for specs that stub only the external dependencies. */
export const LIVE_CLASS_SERVICES = [
  LiveClassService,
  LiveClassAccessService,
  LiveClassBoardStateService,
  LiveClassChatService,
  LiveClassDemoService,
  LiveClassModerationService,
  LiveClassPullService,
  LiveClassRecordingService,
  LiveClassScreenShareService,
  LiveClassSpectateService,
  LiveClassWaitingRoomService,
  GameRecorderService,
  UNLIMITED_ENTITLEMENTS,
];
