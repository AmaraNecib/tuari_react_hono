import "@/i18n"

import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { authBootstrapInputSchema, phonePasswordSignInSchema } from "@tuari/contracts"
import {
  BriefcaseBusiness,
  LayoutGrid,
  LogOut,
  MoonStar,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
  Sparkles,
  SunMedium,
  UserSquare2,
  Users,
  Warehouse,
} from "lucide-react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAppPreferences } from "@/features/preferences/preferences"
import { showSuccessToast } from "@/lib/toast"
import { cn } from "@/lib/utils"

import {
  useAddWorkspaceRecordMutation,
  useAuthSetupStatusQuery,
  useBootstrapFirstUserMutation,
  useDemoSessionQuery,
  useDemoSignInMutation,
  useDemoSignOutMutation,
  useDemoWorkspaceQuery,
  useRemoveWorkspaceRecordMutation,
  useResetWorkspaceMutation,
  type DemoEmployee,
  type SectionKey,
} from "./mock-dashboard"

type EmployeeRow = {
  id: string
  name: string
  role: string
  phone: string
  status: string
  managerName: string
  projectName: string
  isWorker: boolean
  hierarchyHint: string | null
  notes: string | null
}

type PendingDelete = {
  section: Exclude<SectionKey, "settings">
  id: string
  label: string
}

type FormErrors = {
  name?: string
  phone?: string
  password?: string
  setupSecret?: string
}


const primarySections: Array<Exclude<SectionKey, "settings">> = [
  "employees",
  "projects",
  "warehouses",
  "roles",
]

const sectionIcons = {
  employees: Users,
  projects: BriefcaseBusiness,
  warehouses: Warehouse,
  roles: ShieldCheck,
  settings: LayoutGrid,
} satisfies Record<SectionKey, typeof Users>

function getStatusTone(status: string) {
  if (status === "ACTIVE") {
    return "bg-emerald-500/12 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-400/14 dark:text-emerald-200"
  }

  if (status === "LEFT" || status === "ARCHIVED") {
    return "bg-slate-500/12 text-slate-700 ring-slate-500/20 dark:bg-slate-400/14 dark:text-slate-200"
  }

  return "bg-amber-500/12 text-amber-700 ring-amber-500/20 dark:bg-amber-400/14 dark:text-amber-100"
}

function formatName(employee: DemoEmployee) {
  return `${employee.firstName} ${employee.lastName}`
}

function DataCard({ title, value, detail }: { title: string; value: number; detail: string }) {
  return (
    <article className="app-shell relative overflow-hidden rounded-[28px] border border-white/65 bg-card/85 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-card/88">
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">{title}</p>
          <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        </div>
        <div className="rounded-2xl bg-primary/10 p-2 text-primary">
          <Sparkles className="size-5" />
        </div>
      </div>
      <p className="relative z-10 mt-4 text-sm leading-6 text-muted-foreground">{detail}</p>
    </article>
  )
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border/60 pb-5 xl:flex-row xl:items-end xl:justify-between">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

function mapCredentialErrors(copy: { validation: { phone: string; phoneFormat: string; password: string; passwordShort: string } }, phone: string, password: string) {
  const errors: FormErrors = {}
  const result = phonePasswordSignInSchema.safeParse({
    phone: phone.trim(),
    password,
  })

  if (phone.trim().length === 0) {
    errors.phone = copy.validation.phone
  } else if (!result.success && result.error.issues.some((issue) => issue.path[0] === "phone")) {
    errors.phone = copy.validation.phoneFormat
  }

  if (password.length === 0) {
    errors.password = copy.validation.password
  } else if (!result.success && result.error.issues.some((issue) => issue.path[0] === "password")) {
    errors.password = copy.validation.passwordShort
  }

  return errors
}

function mapBootstrapErrors(copy: { validation: { name: string; phone: string; phoneFormat: string; password: string; passwordShort: string; setupSecret: string } }, name: string, phone: string, password: string, setupSecret: string, requiresSetupKey: boolean) {
  const errors = mapCredentialErrors(copy, phone, password)
  const result = authBootstrapInputSchema.safeParse({
    name: name.trim(),
    phone: phone.trim(),
    password,
  })

  if (name.trim().length === 0) {
    errors.name = copy.validation.name
  } else if (!result.success && result.error.issues.some((issue) => issue.path[0] === "name")) {
    errors.name = copy.validation.name
  }

  if (requiresSetupKey && setupSecret.trim().length === 0) {
    errors.setupSecret = copy.validation.setupSecret
  }

  return errors
}

function SidebarActionButton({
  ariaLabel,
  children,
  collapsed,
  current,
  tooltip,
  variant = "ghost",
  onClick,
}: {
  ariaLabel: string
  children: ReactNode
  collapsed: boolean
  current?: boolean
  tooltip: string
  variant?: "ghost" | "secondary"
  onClick: () => void
}) {
  const button = (
    <Button
      aria-current={current ? "page" : undefined}
      aria-label={ariaLabel}
      className={cn("h-11 w-full rounded-2xl px-3", collapsed ? "justify-center px-0" : "justify-start")}
      variant={variant}
      onClick={onClick}
    >
      {children}
    </Button>
  )

  if (!collapsed) {
    return button
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="left">{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export function HomeView() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useAppPreferences()
  const setupStatusQuery = useAuthSetupStatusQuery()
  const sessionQuery = useDemoSessionQuery()
  const workspaceQuery = useDemoWorkspaceQuery()
  const bootstrapMutation = useBootstrapFirstUserMutation()
  const signInMutation = useDemoSignInMutation()
  const signOutMutation = useDemoSignOutMutation()
  const addRecordMutation = useAddWorkspaceRecordMutation()
  const removeRecordMutation = useRemoveWorkspaceRecordMutation()
  const resetWorkspaceMutation = useResetWorkspaceMutation()

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [setupSecret, setSetupSecret] = useState("")
  const [errors, setErrors] = useState<FormErrors>({})
  const [activeSection, setActiveSection] = useState<SectionKey>("employees")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [signOutOpen, setSignOutOpen] = useState(false)

  const workspace = workspaceQuery.data
  const session = sessionQuery.data

  const copy = {
    auth: {
      loginTitle: t("auth.loginTitle"),
      setupTitle: t("auth.setupTitle"),
      nameLabel: t("auth.nameLabel"),
      phoneLabel: t("auth.phoneLabel"),
      passwordLabel: t("auth.passwordLabel"),
      setupSecretLabel: t("auth.setupSecretLabel"),
      namePlaceholder: t("auth.namePlaceholder"),
      phonePlaceholder: t("auth.phonePlaceholder"),
      passwordPlaceholder: t("auth.passwordPlaceholder"),
      setupSecretPlaceholder: t("auth.setupSecretPlaceholder"),
      signIn: t("auth.signIn"),
      createFirstUser: t("auth.createFirstUser"),
    },
    common: {
      cancel: t("common.cancel"),
      confirm: t("common.confirm"),
      archive: t("common.archive"),
      delete: t("common.delete"),
      yes: t("common.yes"),
      no: t("common.no"),
      loadingAuth: t("common.loadingAuth"),
    },
    shell: {
      workspace: t("shell.workspace"),
      module: t("shell.module"),
      description: t("shell.description"),
      quickMetrics: t("shell.quickMetrics"),
      addRecord: t("shell.addRecord"),
      collapse: t("shell.collapse"),
      expand: t("shell.expand"),
      themeToggle: t("shell.themeToggle"),
      signOut: t("shell.signOut"),
      resetWorkspace: t("shell.resetWorkspace"),
      resetTitle: t("shell.resetTitle"),
      resetDescription: t("shell.resetDescription"),
      signOutTitle: t("shell.signOutTitle"),
      signOutDescription: t("shell.signOutDescription"),
      destructiveTitle: t("shell.destructiveTitle"),
      destructiveDescription: t("shell.destructiveDescription"),
      empty: t("shell.empty"),
      noManager: t("shell.noManager"),
      noProject: t("shell.noProject"),
      activePage: t("shell.activePage"),
      themeLight: t("shell.themeLight"),
      themeDark: t("shell.themeDark"),
      sidebarHint: t("shell.sidebarHint"),
      settingsThemeDescription: t("shell.settingsThemeDescription"),
      settingsResetDescription: t("shell.settingsResetDescription"),
    },
    validation: {
      name: t("auth.validation.name"),
      phone: t("auth.validation.phone"),
      phoneFormat: t("auth.validation.phoneFormat"),
      password: t("auth.validation.password"),
      passwordShort: t("auth.validation.passwordShort"),
      setupSecret: t("auth.validation.setupSecret"),
    },
    metrics: {
      workers: t("metrics.workers"),
      projects: t("metrics.projects"),
      warehouses: t("metrics.warehouses"),
      roles: t("metrics.roles"),
    },
    columns: {
      name: t("columns.name"),
      role: t("columns.role"),
      manager: t("columns.manager"),
      project: t("columns.project"),
      phone: t("columns.phone"),
      status: t("columns.status"),
      location: t("columns.location"),
      workers: t("columns.workers"),
      address: t("columns.address"),
      system: t("columns.system"),
      description: t("columns.description"),
      key: t("columns.key"),
    },
    sections: {
      employees: {
        label: t("sections.employees.label"),
        description: t("sections.employees.description"),
      },
      projects: {
        label: t("sections.projects.label"),
        description: t("sections.projects.description"),
      },
      warehouses: {
        label: t("sections.warehouses.label"),
        description: t("sections.warehouses.description"),
      },
      roles: {
        label: t("sections.roles.label"),
        description: t("sections.roles.description"),
      },
      settings: {
        label: t("sections.settings.label"),
        description: t("sections.settings.description"),
      },
    },
    toasts: {
      themeDark: t("toasts.themeDark"),
      themeLight: t("toasts.themeLight"),
    },
  }

  const activeSectionCopy = copy.sections[activeSection]

  const derived = useMemo(() => {
    if (!workspace) {
      return null
    }

    const roleById = new Map(workspace.roles.map((role) => [role.id, role]))
    const employeeById = new Map(workspace.employees.map((employee) => [employee.id, employee]))
    const projectById = new Map(workspace.projects.map((project) => [project.id, project]))
    const activeManagerByWorker = new Map(
      workspace.managerAssignments
        .filter((assignment) => assignment.status === "ACTIVE")
        .map((assignment) => [assignment.workerId, assignment]),
    )
    const activeProjectByEmployee = new Map(
      workspace.projectAssignments
        .filter((assignment) => assignment.status === "ACTIVE")
        .map((assignment) => [assignment.employeeId, assignment]),
    )

    const employeeRows: EmployeeRow[] = workspace.employees
      .map((employee) => {
        const role = roleById.get(employee.roleId)
        const managerAssignment = activeManagerByWorker.get(employee.id)
        const manager = managerAssignment ? employeeById.get(managerAssignment.managerId) : null
        const projectAssignment = activeProjectByEmployee.get(employee.id)
        const project = projectAssignment ? projectById.get(projectAssignment.projectId) : null
        const isWorker = role?.key === "worker"

        return {
          id: employee.id,
          name: formatName(employee),
          role: role?.name ?? copy.shell.noManager,
          phone: employee.phone,
          status: employee.status,
          managerName: manager ? formatName(manager) : copy.shell.noManager,
          projectName: project?.name ?? copy.shell.noProject,
          isWorker,
          hierarchyHint: isWorker && manager ? `${copy.columns.manager}: ${formatName(manager)}` : null,
          notes: employee.notes,
        }
      })
      .sort((left, right) => {
        if (left.isWorker !== right.isWorker) {
          return left.isWorker ? 1 : -1
        }

        if (left.managerName !== right.managerName) {
          return left.managerName.localeCompare(right.managerName, "ar")
        }

        return left.name.localeCompare(right.name, "ar")
      })

    const projects = workspace.projects.map((project) => {
      const manager = project.managerId ? employeeById.get(project.managerId) : null
      const activeWorkers = workspace.projectAssignments.filter(
        (assignment) => assignment.projectId === project.id && assignment.status === "ACTIVE",
      ).length

      return {
        ...project,
        managerName: manager ? formatName(manager) : copy.shell.noManager,
        activeWorkers,
      }
    })

    const warehouses = workspace.warehouses.map((warehouse) => {
      const manager = warehouse.managerId ? employeeById.get(warehouse.managerId) : null

      return {
        ...warehouse,
        managerName: manager ? formatName(manager) : copy.shell.noManager,
      }
    })

    return {
      employeeRows,
      projects,
      warehouses,
      roles: workspace.roles,
      metrics: {
        workers: employeeRows.filter((employee) => employee.isWorker && employee.status === "ACTIVE").length,
        projects: projects.filter((project) => project.status === "ACTIVE").length,
        warehouses: warehouses.filter((warehouse) => warehouse.status !== "ARCHIVED").length,
        roles: workspace.roles.length,
      },
    }
  }, [copy.columns.manager, copy.shell.noManager, copy.shell.noProject, workspace])

  const hasUsers = setupStatusQuery.data?.hasUsers ?? true
  const requiresSetupKey = setupStatusQuery.data?.requiresSetupKey ?? false
  const isFirstRun = !session && !hasUsers

  function handleThemeToggle() {
    toggleTheme()
    showSuccessToast(theme === "light" ? copy.toasts.themeDark : copy.toasts.themeLight)
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors = mapCredentialErrors(copy, phone, password)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    await signInMutation.mutateAsync({
      phone: phone.trim(),
      password,
      rememberMe: true,
    })

    setPassword("")
  }

  async function handleBootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors = mapBootstrapErrors(copy, name, phone, password, setupSecret, requiresSetupKey)

    setErrors(nextErrors)

    if (Object.values(nextErrors).some(Boolean)) {
      return
    }

    await bootstrapMutation.mutateAsync({
      name: name.trim(),
      phone: phone.trim(),
      password,
      setupSecret: setupSecret.trim() || undefined,
    })

    await signInMutation.mutateAsync({
      phone: phone.trim(),
      password,
      rememberMe: true,
    })

    setName("")
    setPassword("")
    setSetupSecret("")
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return
    }

    await removeRecordMutation.mutateAsync({
      section: pendingDelete.section,
      id: pendingDelete.id,
    })

    setPendingDelete(null)
  }

  async function confirmSignOut() {
    await signOutMutation.mutateAsync()
    setSignOutOpen(false)
    setActiveSection("employees")
  }

  if (!session) {
    if (setupStatusQuery.isLoading) {
      return (
        <main className="flex min-h-screen items-center justify-center px-6 py-8">
          <section className="w-full max-w-lg rounded-[32px] border border-white/70 bg-card/94 p-8 text-center shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-card/94 lg:p-10">
            <p className="text-sm text-muted-foreground">{copy.common.loadingAuth}</p>
          </section>
        </main>
      )
    }

    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-8">
        <section className="w-full max-w-lg rounded-[32px] border border-white/70 bg-card/94 p-8 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-card/94 lg:p-10">
          <form className="space-y-7" onSubmit={isFirstRun ? handleBootstrap : handleSignIn}>
            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                {isFirstRun ? copy.auth.setupTitle : copy.auth.loginTitle}
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">{copy.shell.description}</p>
            </div>

            <div className="space-y-5">
              {isFirstRun ? (
                <label className="flex flex-col gap-2.5">
                  <span className="text-sm font-medium text-foreground">{copy.auth.nameLabel}</span>
                  <Input
                    autoComplete="name"
                    name="name"
                    placeholder={copy.auth.namePlaceholder}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  {errors.name ? <p className="text-sm text-destructive">{errors.name}</p> : null}
                </label>
              ) : null}

              <label className="flex flex-col gap-2.5">
                <span className="text-sm font-medium text-foreground">{copy.auth.phoneLabel}</span>
                <Input
                  autoComplete="tel"
                  dir="ltr"
                  inputMode="tel"
                  name="phone"
                  placeholder={copy.auth.phonePlaceholder}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
                {errors.phone ? <p className="text-sm text-destructive">{errors.phone}</p> : null}
              </label>

              <label className="flex flex-col gap-2.5">
                <span className="text-sm font-medium text-foreground">{copy.auth.passwordLabel}</span>
                <Input
                  autoComplete="current-password"
                  name="password"
                  placeholder={copy.auth.passwordPlaceholder}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                {errors.password ? <p className="text-sm text-destructive">{errors.password}</p> : null}
              </label>

              {isFirstRun && requiresSetupKey ? (
                <label className="flex flex-col gap-2.5">
                  <span className="text-sm font-medium text-foreground">{copy.auth.setupSecretLabel}</span>
                  <Input
                    autoComplete="off"
                    name="setup-secret"
                    placeholder={copy.auth.setupSecretPlaceholder}
                    type="password"
                    value={setupSecret}
                    onChange={(event) => setSetupSecret(event.target.value)}
                  />
                  {errors.setupSecret ? <p className="text-sm text-destructive">{errors.setupSecret}</p> : null}
                </label>
              ) : null}
            </div>

            <Button
              className="mt-2 h-12 w-full rounded-2xl text-base"
              disabled={signInMutation.isPending || bootstrapMutation.isPending}
              type="submit"
            >
              {isFirstRun ? copy.auth.createFirstUser : copy.auth.signIn}
            </Button>
          </form>
        </section>
      </main>
    )
  }

  if (!derived) {
    return null
  }

  const sidebarWidth = sidebarCollapsed ? "6rem" : "19rem"

  return (
    <div className="h-screen overflow-hidden px-4 py-4 lg:px-5 lg:py-5">
      <aside
        className="fixed inset-y-4 right-4 z-30 flex flex-col rounded-[30px] border border-white/70 bg-sidebar/94 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/10"
        data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
        style={{ width: sidebarWidth }}
      >
        <div className={cn("mb-3 flex items-center", sidebarCollapsed ? "justify-center" : "justify-between gap-2") }>
          {!sidebarCollapsed ? <p className="text-[11px] font-medium tracking-[0.22em] text-muted-foreground uppercase">{copy.shell.module}</p> : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={sidebarCollapsed ? copy.shell.expand : copy.shell.collapse}
                  className={cn(
                    "h-10 rounded-2xl border border-border/70 bg-background/75 text-sm shadow-sm backdrop-blur",
                    sidebarCollapsed ? "w-10 px-0" : "px-3",
                  )}
                  type="button"
                  variant="ghost"
                  onClick={() => setSidebarCollapsed((current) => !current)}
                >
                  {sidebarCollapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
                  {!sidebarCollapsed ? <span className="me-1">{copy.shell.collapse}</span> : null}
                </Button>
              }
            />
            <TooltipContent side="left">{sidebarCollapsed ? copy.shell.expand : copy.shell.collapse}</TooltipContent>
          </Tooltip>
        </div>

        <div className={cn("mb-4 rounded-[24px] border border-white/60 bg-white/65 p-3 dark:border-white/10 dark:bg-white/5", sidebarCollapsed ? "text-center" : "") }>
          <div className={cn("flex items-center gap-3", sidebarCollapsed ? "justify-center" : "") }>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <UserSquare2 className="size-5" />
            </div>
            {!sidebarCollapsed ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sidebar-foreground">{session.name}</p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">{session.phone}</p>
              </div>
            ) : null}
          </div>
          {!sidebarCollapsed ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.shell.sidebarHint}</p>
          ) : null}
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-1.5">
          {primarySections.map((section) => {
            const Icon = sectionIcons[section]
            const isActive = activeSection === section

            return (
              <SidebarActionButton
                key={section}
                ariaLabel={copy.sections[section].label}
                collapsed={sidebarCollapsed}
                current={isActive}
                tooltip={copy.sections[section].label}
                variant={isActive ? "secondary" : "ghost"}
                onClick={() => setActiveSection(section)}
              >
                <Icon className="size-4" />
                {!sidebarCollapsed ? <span>{copy.sections[section].label}</span> : null}
              </SidebarActionButton>
            )
          })}
        </nav>

        <div className="mt-4 space-y-1.5 border-t border-sidebar-border/70 pt-4">
          <SidebarActionButton
            ariaLabel={copy.shell.themeToggle}
            collapsed={sidebarCollapsed}
            tooltip={copy.shell.themeToggle}
            onClick={handleThemeToggle}
          >
            {theme === "light" ? <MoonStar className="size-4" /> : <SunMedium className="size-4" />}
            {!sidebarCollapsed ? <span>{copy.shell.themeToggle}</span> : null}
          </SidebarActionButton>
          <SidebarActionButton
            ariaLabel={copy.sections.settings.label}
            collapsed={sidebarCollapsed}
            current={activeSection === "settings"}
            tooltip={copy.sections.settings.label}
            variant={activeSection === "settings" ? "secondary" : "ghost"}
            onClick={() => setActiveSection("settings")}
          >
            <LayoutGrid className="size-4" />
            {!sidebarCollapsed ? <span>{copy.sections.settings.label}</span> : null}
          </SidebarActionButton>
          <SidebarActionButton
            ariaLabel={copy.shell.signOut}
            collapsed={sidebarCollapsed}
            tooltip={copy.shell.signOut}
            onClick={() => setSignOutOpen(true)}
          >
            <LogOut className="size-4 text-destructive" />
            {!sidebarCollapsed ? <span className="text-destructive">{copy.shell.signOut}</span> : null}
          </SidebarActionButton>
        </div>
      </aside>

      <main className="h-full overflow-y-auto" style={{ paddingRight: `calc(${sidebarWidth} + 1.25rem)` }}>
        <div className="mx-auto flex min-h-full max-w-[1500px] min-w-0 flex-col gap-5 pb-8">
          <section className="app-shell relative overflow-hidden rounded-[30px] border border-white/70 bg-card/88 px-5 py-4 shadow-[0_24px_90px_rgba(15,23,42,0.1)] backdrop-blur-xl dark:border-white/10 dark:bg-card/88 lg:px-6">
            <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbPage>{copy.shell.workspace}</BreadcrumbPage>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{copy.shell.module}</BreadcrumbPage>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{activeSectionCopy.label}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-foreground">
                    {copy.shell.activePage}
                  </span>
                  <span>{copy.shell.description}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-4">
            <DataCard title={copy.metrics.workers} value={derived.metrics.workers} detail={copy.shell.quickMetrics} />
            <DataCard title={copy.metrics.projects} value={derived.metrics.projects} detail={copy.sections.projects.label} />
            <DataCard title={copy.metrics.warehouses} value={derived.metrics.warehouses} detail={copy.sections.warehouses.label} />
            <DataCard title={copy.metrics.roles} value={derived.metrics.roles} detail={copy.sections.roles.label} />
          </section>

          <section className="rounded-[32px] border border-white/70 bg-card/92 p-6 shadow-[0_24px_90px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-card/92">
            {activeSection === "employees" ? (
              <div className="space-y-6">
                <SectionHeader
                  action={
                    <Button disabled={addRecordMutation.isPending} onClick={() => addRecordMutation.mutate("employees")}>
                      {copy.shell.addRecord}
                    </Button>
                  }
                  description={copy.sections.employees.description}
                  title={copy.sections.employees.label}
                />
                <div className="overflow-hidden rounded-[28px] border border-border/60">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.name}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.role}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.manager}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.project}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.phone}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.status}</th>
                          <th className="px-4 py-3 text-start font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {derived.employeeRows.length > 0 ? (
                          derived.employeeRows.map((row) => (
                            <tr key={row.id} className="border-t border-border/60 bg-background/45 align-top">
                              <td className="px-4 py-4">
                                <div className={cn("space-y-1", row.isWorker ? "pr-4" : "") }>
                                  <p className="font-medium text-foreground">{row.name}</p>
                                  {row.hierarchyHint ? <p className="text-xs text-muted-foreground">{row.hierarchyHint}</p> : null}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-muted-foreground">{row.role}</td>
                              <td className="px-4 py-4 text-muted-foreground">{row.managerName}</td>
                              <td className="px-4 py-4 text-muted-foreground">{row.projectName}</td>
                              <td className="px-4 py-4 text-foreground" dir="ltr">{row.phone}</td>
                              <td className="px-4 py-4">
                                <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", getStatusTone(row.status))}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setPendingDelete({
                                      section: "employees",
                                      id: row.id,
                                      label: row.name,
                                    })
                                  }
                                >
                                  {copy.common.archive}
                                </Button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>{copy.shell.empty}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === "projects" ? (
              <div className="space-y-6">
                <SectionHeader
                  action={
                    <Button disabled={addRecordMutation.isPending} onClick={() => addRecordMutation.mutate("projects")}>
                      {copy.shell.addRecord}
                    </Button>
                  }
                  description={copy.sections.projects.description}
                  title={copy.sections.projects.label}
                />
                <div className="overflow-hidden rounded-[28px] border border-border/60">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.name}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.manager}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.location}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.workers}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.status}</th>
                          <th className="px-4 py-3 text-start font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {derived.projects.map((project) => (
                          <tr key={project.id} className="border-t border-border/60 bg-background/45">
                            <td className="px-4 py-4">
                              <p className="font-medium text-foreground">{project.name}</p>
                              {project.notes ? <p className="mt-1 text-xs text-muted-foreground">{project.notes}</p> : null}
                            </td>
                            <td className="px-4 py-4 text-muted-foreground">{project.managerName}</td>
                            <td className="px-4 py-4 text-muted-foreground">{project.location ?? copy.shell.noManager}</td>
                            <td className="px-4 py-4 text-foreground">{project.activeWorkers}</td>
                            <td className="px-4 py-4">
                              <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", getStatusTone(project.status))}>
                                {project.status}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setPendingDelete({
                                    section: "projects",
                                    id: project.id,
                                    label: project.name,
                                  })
                                }
                              >
                                {copy.common.archive}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === "warehouses" ? (
              <div className="space-y-6">
                <SectionHeader
                  action={
                    <Button disabled={addRecordMutation.isPending} onClick={() => addRecordMutation.mutate("warehouses")}>
                      {copy.shell.addRecord}
                    </Button>
                  }
                  description={copy.sections.warehouses.description}
                  title={copy.sections.warehouses.label}
                />
                <div className="overflow-hidden rounded-[28px] border border-border/60">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.name}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.manager}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.address}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.status}</th>
                          <th className="px-4 py-3 text-start font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {derived.warehouses.map((warehouse) => (
                          <tr key={warehouse.id} className="border-t border-border/60 bg-background/45">
                            <td className="px-4 py-4">
                              <p className="font-medium text-foreground">{warehouse.name}</p>
                              {warehouse.notes ? <p className="mt-1 text-xs text-muted-foreground">{warehouse.notes}</p> : null}
                            </td>
                            <td className="px-4 py-4 text-muted-foreground">{warehouse.managerName}</td>
                            <td className="px-4 py-4 text-muted-foreground">{warehouse.address ?? copy.shell.noManager}</td>
                            <td className="px-4 py-4">
                              <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", getStatusTone(warehouse.status))}>
                                {warehouse.status}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setPendingDelete({
                                    section: "warehouses",
                                    id: warehouse.id,
                                    label: warehouse.name,
                                  })
                                }
                              >
                                {copy.common.archive}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === "roles" ? (
              <div className="space-y-6">
                <SectionHeader
                  action={
                    <Button disabled={addRecordMutation.isPending} onClick={() => addRecordMutation.mutate("roles")}>
                      {copy.shell.addRecord}
                    </Button>
                  }
                  description={copy.sections.roles.description}
                  title={copy.sections.roles.label}
                />
                <div className="overflow-hidden rounded-[28px] border border-border/60">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.name}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.key}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.system}</th>
                          <th className="px-4 py-3 text-start font-medium">{copy.columns.description}</th>
                          <th className="px-4 py-3 text-start font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {derived.roles.map((role) => (
                          <tr key={role.id} className="border-t border-border/60 bg-background/45">
                            <td className="px-4 py-4 font-medium text-foreground">{role.name}</td>
                            <td className="px-4 py-4 text-muted-foreground">{role.key}</td>
                            <td className="px-4 py-4 text-muted-foreground">{role.isSystem ? copy.common.yes : copy.common.no}</td>
                            <td className="px-4 py-4 text-muted-foreground">{role.description ?? copy.shell.empty}</td>
                            <td className="px-4 py-4 text-end">
                              <Button
                                disabled={role.isSystem}
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setPendingDelete({
                                    section: "roles",
                                    id: role.id,
                                    label: role.name,
                                  })
                                }
                              >
                                {copy.common.delete}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === "settings" ? (
              <div className="space-y-6">
                <SectionHeader description={copy.sections.settings.description} title={copy.sections.settings.label} />
                <div className="grid gap-4 xl:grid-cols-2">
                  <article className="rounded-[28px] border border-border/60 bg-background/55 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{copy.shell.themeToggle}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.shell.settingsThemeDescription}</p>
                      </div>
                      <Button variant="outline" onClick={handleThemeToggle}>{theme === "light" ? copy.shell.themeDark : copy.shell.themeLight}</Button>
                    </div>
                  </article>
                  <article className="rounded-[28px] border border-border/60 bg-background/55 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{copy.shell.resetWorkspace}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.shell.settingsResetDescription}</p>
                      </div>
                      <Button variant="outline" onClick={() => resetWorkspaceMutation.mutate()}>{copy.shell.resetWorkspace}</Button>
                    </div>
                  </article>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => (!open ? setPendingDelete(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.shell.destructiveTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.shell.destructiveDescription}
              {pendingDelete ? ` ${pendingDelete.label}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{copy.common.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.shell.signOutTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.shell.signOutDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSignOut}>{copy.common.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
