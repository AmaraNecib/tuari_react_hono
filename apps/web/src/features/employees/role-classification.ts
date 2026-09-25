/**
 * Workforce role classification (issue #20).
 *
 * This module decides, for a TARGET employee record, which workforce label
 * applies so the UI can show the right placement/organization surfaces. It is
 * NOT an authorization check — actor authorization stays permission-based in
 * RBAC (each assignment RPC is gated by `employees:update`).
 *
 * The app seeds three organizational workforce labels:
 *   - worker            → a field worker assigned to one project under a
 *                         manager, or to a warehouse
 *   - project_manager   → manages one or more projects and their workers
 *   - warehouse_manager → manages a warehouse and its team
 *
 * Each helper matches the EXACT role key, and these keys are chosen to mirror
 * the role gate the API uses in workforce.service.ts (worker / project_manager
 * / warehouse_manager). There is deliberately NO manager-as-worker mapping:
 * a role-key check here always passes/fails in lock-step with the backend gate
 * so a manager-role user can never pass the UI check and be rejected by the
 * API (or vice versa).
 *
 * The three labels are organizational for the MVP (they hold no permissions);
 * the admin performs the orchestration. `admin` itself is not a worker, and
 * `manager` / `viewer` are INERT roles (zero permissions, disabled) that are
 * never surfaced as workforce labels.
 *
 * EMPLOYEE ROLE SELECTION: when creating or editing an employee the UI only
 * offers the three organizational workforce labels (worker / project_manager
 * / warehouse_manager). `manager` and `viewer` are intentionally NOT offered
 * — they hold no permissions in the MVP and must not be assignable to a new
 * employee. `admin` is also not offered (it is the bootstrap owner). Use
 * `isEmployeeRoleSelectable` to filter the role options.
 */
export function isEmployeeRoleSelectable(key: string | null | undefined): boolean {
  return key === "worker" || key === "project_manager" || key === "warehouse_manager"
}
export function isWorkerRoleKey(key: string | null | undefined): boolean {
  return key === "worker"
}

export function isProjectManagerRoleKey(key: string | null | undefined): boolean {
  return key === "project_manager"
}

export function isWarehouseManagerRoleKey(key: string | null | undefined): boolean {
  return key === "warehouse_manager"
}

export type WorkforceRoleClass = {
  isWorker: boolean
  isProjectManager: boolean
  isWarehouseManager: boolean
}

export function classifyWorkforceRole(key: string | null | undefined): WorkforceRoleClass {
  return {
    isWorker: isWorkerRoleKey(key),
    isProjectManager: isProjectManagerRoleKey(key),
    isWarehouseManager: isWarehouseManagerRoleKey(key),
  }
}
