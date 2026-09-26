/**
 * License seat limit for active user accounts (issue #394).
 *
 * The license `maxUsers` value is a hard cap on ACTIVE employee accounts:
 *
 * - `maxUsers > 0` — cap on `status === "ACTIVE"` employees. `INACTIVE` and
 *   `LEFT` employees do not consume a seat.
 * - `maxUsers === 0` — unlimited (the documented sentinel).
 * - Any non-positive or non-finite value — unlimited. The wire contract forbids
 *   negatives, the shell always forwards an integer, and the cap is applied
 *   strictly as `maxUsers > 0`, so a malformed dev env var can never wedge
 *   employee creation.
 *
 * Seats are ONLY capped while the license status is `active`. During the
 * post-install `trial` and the post-expiry `grace` window a prospect must be
 * able to evaluate the product multi-user before buying, so those statuses are
 * explicitly uncapped. This is the single definition of the rule: every
 * mutation that can increase the active-user count (employee create, batch
 * create, reactivation) calls {@link assertActiveEmployeeSeatAvailable}.
 */

import { getLicenseInfo } from "../../infrastructure/license";
import { CompanyError } from "./company.errors";
import type { WorkforceRepository } from "./workforce.repository";

/** The narrow repository seam the seat rule needs to count active employees. */
type ActiveEmployeeReader = Pick<WorkforceRepository, "countEmployees">;

/**
 * Refuse a mutation that would push the ACTIVE employee count over the
 * licensed seat cap.
 *
 * @param repository workforce repository used to count active employees.
 * @param additionalActiveEmployees how many extra ACTIVE accounts the pending
 *   mutation would add (defaults to one). Non-positive values are a no-op
 *   (deactivations and updates that keep a count are never refused).
 * @throws {CompanyError} code `BUSINESS_RULE`, naming the limit and the current
 *   active count, when the cap would be exceeded.
 */
export function assertActiveEmployeeSeatAvailable(
  repository: ActiveEmployeeReader,
  additionalActiveEmployees = 1,
): void {
  if (additionalActiveEmployees <= 0) {
    return;
  }

  const license = getLicenseInfo();

  // Only a purchased, ACTIVE license caps seats. `trial` and `grace` (and any
  // non-usable status) are uncapped here; the license status gate owns those.
  if (license.status !== "active") {
    return;
  }

  // 0 means unlimited; a negative/non-positive value must not cap either.
  if (!(license.maxUsers > 0)) {
    return;
  }

  const currentActiveEmployees = repository.countEmployees({ status: "ACTIVE" });
  const nextActiveEmployees = currentActiveEmployees + additionalActiveEmployees;

  if (nextActiveEmployees > license.maxUsers) {
    const message =
      `تم بلوغ الحد الأقصى لعدد المستخدمين النشطين في هذا الترخيص (${license.maxUsers}). ` +
      `العدد الحالي: ${currentActiveEmployees}.`;

    throw new CompanyError("BUSINESS_RULE", message);
  }
}
