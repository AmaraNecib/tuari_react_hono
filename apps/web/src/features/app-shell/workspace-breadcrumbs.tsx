/**
 * Workspace breadcrumbs for navigation.
 * Shows current location in the app hierarchy.
 */
import { Link } from "@tanstack/react-router"
import { Fragment } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { getWorkspaceLinkProps, type WorkspaceRouteTarget } from "@/router/navigation"

type BreadcrumbItemRecord = {
  label: string
  to?: WorkspaceRouteTarget
}

/**
 * @description Component
 */
export function WorkspaceBreadcrumbs({ items }: { items: BreadcrumbItemRecord[] }) {
  return (
    <Breadcrumb className="min-w-0 w-full">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        {items.map((item, index) => {
          const isLast = index === items.length - 1

          return (
            <Fragment key={`${item.label}-${index}`}>
              <BreadcrumbItem className={isLast ? "min-w-0 max-w-full shrink-0" : "hidden min-w-0 max-w-[40%] md:inline-flex md:flex-1"}>
                {isLast || !item.to ? (
                  <BreadcrumbPage className="truncate" title={item.label}>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink className="block truncate" title={item.label} render={<Link {...getWorkspaceLinkProps(item.to)} />}>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast ? <BreadcrumbSeparator className="hidden shrink-0 md:flex" /> : null}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
