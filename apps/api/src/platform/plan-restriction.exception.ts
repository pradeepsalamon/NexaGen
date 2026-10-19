import { HttpException, HttpStatus } from "@nestjs/common";
import {
  PLAN_FEATURES,
  PLAN_LIMITS,
  type PlanFeatureKey,
  type PlanLimitKey,
  type PlanRestrictionError
} from "@nexa-chess/types";

/**
 * 402, never 401/403: a 401 makes the web client spend a refresh rotation,
 * and a 403 reads as "your role can't" when the answer is "your plan can't".
 */
export class PlanRestrictionException extends HttpException {
  constructor(body: Omit<PlanRestrictionError, "statusCode">) {
    super({ ...body, statusCode: HttpStatus.PAYMENT_REQUIRED }, HttpStatus.PAYMENT_REQUIRED);
  }

  static featureRequired(feature: PlanFeatureKey) {
    return new PlanRestrictionException({
      code: "PLAN_FEATURE_REQUIRED",
      feature,
      message: `${PLAN_FEATURES[feature].label} isn't included in your academy's plan. Ask your academy owner to upgrade.`
    });
  }

  static limitReached(limit: PlanLimitKey, value: number) {
    return new PlanRestrictionException({
      code: "PLAN_LIMIT_REACHED",
      limit,
      message: `Your academy's plan allows ${value} ${PLAN_LIMITS[limit].label.toLowerCase()}, and that limit is reached. Upgrade the plan to add more.`
    });
  }

  static readOnly() {
    return new PlanRestrictionException({
      code: "SUBSCRIPTION_READ_ONLY",
      message: "Your academy's subscription is in its grace period, so changes are paused. Renew the subscription to continue."
    });
  }

  static locked() {
    return new PlanRestrictionException({
      code: "SUBSCRIPTION_LOCKED",
      message: "Your academy's subscription has ended. Renew it to continue."
    });
  }
}
