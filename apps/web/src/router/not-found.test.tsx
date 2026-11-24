// @vitest-environment jsdom
import "@/i18n"
import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router"
import { afterEach, expect, it, vi } from "vitest"
import { router } from "@/router"
import { i18n } from "@/i18n"

vi.mock("@/providers/app-providers", () => ({ AppProviders: ({ children }: { children: ReactNode }) => <>{children}</> }))
afterEach(cleanup)

it.each(["/missing-page-176", "/roles"])("renders the not-found screen and home link for %s", async path => {
  const instance = createRouter({
    routeTree: router.routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultNotFoundComponent: router.options.defaultNotFoundComponent,
  })
  render(<RouterProvider router={instance} />)
  expect(await screen.findByRole("heading", { name: "404" })).toBeTruthy()
  expect(screen.getByRole("heading", { name: i18n.t("detailPages.notFound.title") })).toBeTruthy()
  expect(screen.getByRole("link", { name: i18n.t("detailPages.notFound.backHome") }).getAttribute("href")).toBe("/")
})
