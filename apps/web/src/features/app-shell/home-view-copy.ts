/**
 * Type definitions for home view copy/text content.
 * Provides structured interface for i18n translations.
 */
import type { TFunction } from "i18next"

export type HomeViewCopy = {
  auth: {
    loginTitle: string
    setupTitle: string
    nameLabel: string
    phoneLabel: string
    passwordLabel: string
    setupSecretLabel: string
    namePlaceholder: string
    phonePlaceholder: string
    passwordPlaceholder: string
    setupSecretPlaceholder: string
    signIn: string
    createFirstUser: string
    startupErrorTitle: string
    startupErrorDescription: string
    signInError: string
    bootstrapError: string
    bootstrapSignInError: string
  }
  common: {
    cancel: string
    confirm: string
    archive: string
    delete: string
    yes: string
    no: string
    retry: string
    loading: string
    loadingAuth: string
    view: string
    edit: string
    leave: string
    actions: string
    showPassword: string
    hidePassword: string
  }
  shell: {
    description: string
    addWorker: string
    addProject: string
    addWarehouse: string
    addRole: string
    collapse: string
    expand: string
    themeToggle: string
    signOut: string
    resetWorkspace: string
    signOutTitle: string
    signOutDescription: string
    destructiveTitle: string
    destructiveDescription: string
    empty: string
    noManager: string
    noProject: string
    noLocation: string
    noAddress: string
    themeLight: string
    themeDark: string
    settingsThemeDescription: string
    settingsResetDescription: string
    settingsAccountTitle: string
    settingsAccountDescription: string
    settingsAccountName: string
    settingsAccountPhone: string
    settingsAccountPhoneHint: string
    settingsAccountCurrentPassword: string
    settingsAccountNewPassword: string
    settingsAccountSave: string
    settingsAccountSaving: string
    settingsAccountNamePlaceholder: string
    settingsAccountPhonePlaceholder: string
    settingsAccountCurrentPasswordPlaceholder: string
    settingsAccountNewPasswordPlaceholder: string
    leaveTitle: string
    leaveDescription: string
    deleteEmployeeTitle: string
    deleteEmployeeDescription: string
    settingsAboutTitle: string
    settingsAboutVersion: string
    settingsAboutInstallFromFile: string
    settingsAboutInstallFromFileDescription: string
    settingsAboutFilePickerFilter: string
    settingsUpdateVerifying: string
    settingsUpdateSuccess: string
    settingsUpdateError: string
    settingsAboutTab: string
  }
  validation: {
    name: string
    phone: string
    phoneFormat: string
    password: string
    passwordShort: string
    setupSecret: string
  }
  dashboard: {
    title: string
    description: string
  }
  metrics: {
    workers: string
    projects: string
    warehouses: string
    roles: string
  }
  columns: {
    name: string
    role: string
    manager: string
    project: string
    phone: string
    status: string
    location: string
    workers: string
    address: string
    system: string
    description: string
    key: string
  }
  sections: {
    dashboard: {
      label: string
      description: string
    }
    employees: {
      label: string
      description: string
    }
    debts: {
      label: string
      description: string
    }
    externals: {
      label: string
      description: string
    }
    projects: {
      label: string
      description: string
    }
    salaries: {
      label: string
      description: string
    }
    warehouses: {
      label: string
      description: string
    }
    transactions: {
      label: string
      description: string
    }
    roles: {
      label: string
      description: string
    }
    settings: {
      label: string
      description: string
    }
  }
  toasts: {
    themeDark: string
    themeLight: string
  }
  detailPages: {
    shared: {
      back: string
      currentAssignment: string
      currentlySelected: string
      activeRoleMissing: string
      activeWarehouseMissing: string
      activeWorkerMissing: string
      missingRecordDescription: string
      ongoing: string
    }
    salary: {
      activeSalaryPrefix: string
      currency: string
      daily: string
      weekly: string
      monthly: string
    }
    employee: {
      employmentState: string
      directManager: string
      projectAssignment: string
      warehouseAssignment: string
      projectOwnership: string
      warehouseOwnership: string
    }
    project: {
      managerLabel: string
    }
    warehouse: {
      managerLabel: string
    }
  }
}

export type HomeViewDetailCopy = HomeViewCopy["detailPages"]

/**
 * buildHomeViewCopy(t component.
 */
export function buildHomeViewCopy(t: TFunction): HomeViewCopy {
  return {
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
      startupErrorTitle: t("auth.startupErrorTitle"),
      startupErrorDescription: t("auth.startupErrorDescription"),
      signInError: t("auth.signInError"),
      bootstrapError: t("auth.bootstrapError"),
      bootstrapSignInError: t("auth.bootstrapSignInError"),
    },
    common: {
      cancel: t("common.cancel"),
      confirm: t("common.confirm"),
      archive: t("common.archive"),
      delete: t("common.delete"),
      yes: t("common.yes"),
      no: t("common.no"),
      retry: t("common.retry"),
      loading: t("common.loading"),
      loadingAuth: t("common.loadingAuth"),
      view: t("common.view"),
      edit: t("common.edit"),
      leave: t("common.leave"),
      actions: t("common.actions"),
      showPassword: t("common.showPassword"),
      hidePassword: t("common.hidePassword"),
    },
    shell: {
      description: t("shell.description"),
      addWorker: t("shell.addWorker"),
      addProject: t("shell.addProject"),
      addWarehouse: t("shell.addWarehouse"),
      addRole: t("shell.addRole"),
      collapse: t("shell.collapse"),
      expand: t("shell.expand"),
      themeToggle: t("shell.themeToggle"),
      signOut: t("shell.signOut"),
      resetWorkspace: t("shell.resetWorkspace"),
      signOutTitle: t("shell.signOutTitle"),
      signOutDescription: t("shell.signOutDescription"),
      destructiveTitle: t("shell.destructiveTitle"),
      destructiveDescription: t("shell.destructiveDescription"),
      empty: t("shell.empty"),
      noManager: t("shell.noManager"),
      noProject: t("shell.noProject"),
      noLocation: t("shell.noLocation"),
      noAddress: t("shell.noAddress"),
      themeLight: t("shell.themeLight"),
      themeDark: t("shell.themeDark"),
      settingsThemeDescription: t("shell.settingsThemeDescription"),
      settingsResetDescription: t("shell.settingsResetDescription"),
      settingsAccountTitle: t("shell.settingsAccountTitle"),
      settingsAccountDescription: t("shell.settingsAccountDescription"),
      settingsAccountName: t("shell.settingsAccountName"),
      settingsAccountPhone: t("shell.settingsAccountPhone"),
      settingsAccountPhoneHint: t("shell.settingsAccountPhoneHint"),
      settingsAccountCurrentPassword: t("shell.settingsAccountCurrentPassword"),
      settingsAccountNewPassword: t("shell.settingsAccountNewPassword"),
      settingsAccountSave: t("shell.settingsAccountSave"),
      settingsAccountSaving: t("shell.settingsAccountSaving"),
      settingsAccountNamePlaceholder: t("shell.settingsAccountNamePlaceholder"),
      settingsAccountPhonePlaceholder: t("shell.settingsAccountPhonePlaceholder"),
      settingsAccountCurrentPasswordPlaceholder: t("shell.settingsAccountCurrentPasswordPlaceholder"),
      settingsAccountNewPasswordPlaceholder: t("shell.settingsAccountNewPasswordPlaceholder"),
      leaveTitle: t("shell.leaveTitle"),
      leaveDescription: t("shell.leaveDescription"),
      deleteEmployeeTitle: t("shell.deleteEmployeeTitle"),
      deleteEmployeeDescription: t("shell.deleteEmployeeDescription"),
      settingsAboutTitle: t("shell.settingsAboutTitle"),
      settingsAboutVersion: t("shell.settingsAboutVersion"),
      settingsAboutInstallFromFile: t("shell.settingsAboutInstallFromFile"),
      settingsAboutInstallFromFileDescription: t("shell.settingsAboutInstallFromFileDescription"),
      settingsAboutFilePickerFilter: t("shell.settingsAboutFilePickerFilter"),
      settingsUpdateVerifying: t("shell.settingsUpdateVerifying"),
      settingsUpdateSuccess: t("shell.settingsUpdateSuccess"),
      settingsUpdateError: t("shell.settingsUpdateError"),
      settingsAboutTab: t("shell.settingsAboutTab"),
    },
    validation: {
      name: t("auth.validation.name"),
      phone: t("auth.validation.phone"),
      phoneFormat: t("auth.validation.phoneFormat"),
      password: t("auth.validation.password"),
      passwordShort: t("auth.validation.passwordShort"),
      setupSecret: t("auth.validation.setupSecret"),
    },
    dashboard: {
      title: t("sections.dashboard.label"),
      description: t("sections.dashboard.description"),
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
      dashboard: {
        label: t("sections.dashboard.label"),
        description: t("sections.dashboard.description"),
      },
      employees: {
        label: t("sections.employees.label"),
        description: t("sections.employees.description"),
      },
      debts: {
        label: t("sections.debts.label"),
        description: t("sections.debts.description"),
      },
      externals: {
        label: "الجهات الخارجية",
        description: "إدارة الجهات الخارجية",
      },
      projects: {
        label: t("sections.projects.label"),
        description: t("sections.projects.description"),
      },
      salaries: {
        label: t("sections.salaries.label"),
        description: t("sections.salaries.description"),
      },
      warehouses: {
        label: t("sections.warehouses.label"),
        description: t("sections.warehouses.description"),
      },
      transactions: {
        label: t("sections.transactions.label"),
        description: t("sections.transactions.description"),
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
    detailPages: {
      shared: {
        back: t("detailPages.shared.back"),
        currentAssignment: t("detailPages.shared.currentAssignment"),
        currentlySelected: t("detailPages.shared.currentlySelected"),
        activeRoleMissing: t("detailPages.shared.activeRoleMissing"),
        activeWarehouseMissing: t("detailPages.shared.activeWarehouseMissing"),
        activeWorkerMissing: t("detailPages.shared.activeWorkerMissing"),
        missingRecordDescription: t("detailPages.shared.missingRecordDescription"),
        ongoing: t("detailPages.shared.ongoing"),
      },
      salary: {
        activeSalaryPrefix: t("detailPages.salary.activeSalaryPrefix"),
        currency: t("detailPages.salary.currency"),
        daily: t("detailPages.salary.daily"),
        weekly: t("detailPages.salary.weekly"),
        monthly: t("detailPages.salary.monthly"),
      },
      employee: {
        employmentState: t("detailPages.employee.employmentState"),
        directManager: t("detailPages.employee.directManager"),
        projectAssignment: t("detailPages.employee.projectAssignment"),
        warehouseAssignment: t("detailPages.employee.warehouseAssignment"),
        projectOwnership: t("detailPages.employee.projectOwnership"),
        warehouseOwnership: t("detailPages.employee.warehouseOwnership"),
      },
      project: {
        managerLabel: t("detailPages.project.manager"),
      },
      warehouse: {
        managerLabel: t("detailPages.warehouse.manager"),
      },
    },
  }
}
