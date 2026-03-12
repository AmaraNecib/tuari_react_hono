import { auth } from "../infrastructure/auth/auth";
import { prisma } from "../infrastructure/database/prisma";
import { SessionService } from "../modules/session/session.service";
import { PrismaAuditLogRepository } from "../modules/audit/prisma-audit-log.repository";
import { AuditLogService } from "../modules/audit/audit-log.service";
import { PrismaProjectRepository } from "../modules/projects/prisma-project.repository";
import { ProjectService } from "../modules/projects/project.service";
import { PrismaRoleRepository } from "../modules/roles/prisma-role.repository";
import { RoleService } from "../modules/roles/role.service";
import { PrismaWarehouseRepository } from "../modules/warehouses/prisma-warehouse.repository";
import { WarehouseService } from "../modules/warehouses/warehouse.service";
import { PrismaEmployeeManagerAssignmentRepository } from "../modules/employees/prisma-employee-manager-assignment.repository";
import { EmployeeManagerAssignmentService } from "../modules/employees/employee-manager-assignment.service";
import { PrismaEmployeeProjectAssignmentRepository } from "../modules/employees/prisma-employee-project-assignment.repository";
import { EmployeeProjectAssignmentService } from "../modules/employees/employee-project-assignment.service";
import { PrismaEmployeeRepository } from "../modules/employees/prisma-employee.repository";
import { EmployeeService } from "../modules/employees/employee.service";

const roleRepository = new PrismaRoleRepository(prisma);
const employeeRepository = new PrismaEmployeeRepository(prisma);
const auditLogRepository = new PrismaAuditLogRepository(prisma);
const employeeManagerAssignmentRepository =
  new PrismaEmployeeManagerAssignmentRepository(prisma);
const employeeProjectAssignmentRepository =
  new PrismaEmployeeProjectAssignmentRepository(prisma);
const projectRepository = new PrismaProjectRepository(prisma);
const warehouseRepository = new PrismaWarehouseRepository(prisma);

export const appDependencies = {
  auth,
  sessionService: new SessionService(auth),
  auditLogService: new AuditLogService(auditLogRepository),
  roleService: new RoleService(
    prisma,
    roleRepository,
    employeeRepository,
    auditLogRepository,
  ),
  employeeService: new EmployeeService(
    prisma,
    employeeRepository,
    roleRepository,
    employeeManagerAssignmentRepository,
    employeeProjectAssignmentRepository,
    projectRepository,
    warehouseRepository,
    auditLogRepository,
  ),
  employeeManagerAssignmentService: new EmployeeManagerAssignmentService(
    prisma,
    employeeManagerAssignmentRepository,
    employeeRepository,
    employeeProjectAssignmentRepository,
    auditLogRepository,
  ),
  employeeProjectAssignmentService: new EmployeeProjectAssignmentService(
    prisma,
    employeeProjectAssignmentRepository,
    employeeRepository,
    projectRepository,
    employeeManagerAssignmentRepository,
    auditLogRepository,
  ),
  projectService: new ProjectService(
    prisma,
    projectRepository,
    employeeRepository,
    employeeProjectAssignmentRepository,
    auditLogRepository,
  ),
  warehouseService: new WarehouseService(
    prisma,
    warehouseRepository,
    employeeRepository,
    auditLogRepository,
  ),
} as const;

export type AppDependencies = typeof appDependencies;
