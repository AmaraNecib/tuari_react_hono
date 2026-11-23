import ts from "typescript"

function leafKeys(resource, prefix = "") {
  return Object.entries(resource).flatMap(([name, value]) => {
    const key = prefix ? `${prefix}.${name}` : name
    return value && typeof value === "object" ? leafKeys(value, key) : [key]
  })
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const pluralSuffix = /_(zero|one|two|few|many|other)$/

/**
 * Production literals include lookup maps and helper return values, not just
 * t() arguments. Tests and the resource declaration are excluded by the caller.
 * Templates and concatenations retain only keys matching their static pieces.
 */
export function findUnusedKeys(resource, sources) {
  const literals = new Set()
  const patterns = []
  const objectKeys = new Set()

  function pieces(node) {
    if (ts.isStringLiteralLike(node)) return [node.text]
    if (ts.isParenthesizedExpression(node)) return pieces(node.expression)
    if (ts.isTemplateExpression(node)) {
      return [node.head.text, ...node.templateSpans.flatMap((span) => [
        ...(pieces(span.expression) ?? [null]), span.literal.text,
      ])]
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return [...(pieces(node.left) ?? [null]), ...(pieces(node.right) ?? [null])]
    }
    return null
  }

  for (const { fileName, text } of sources) {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)
    const visit = (node) => {
      if (ts.isStringLiteralLike(node)) literals.add(node.text)
      const isConcatenation = ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken
      const inLargerConcatenation = node.parent && ts.isBinaryExpression(node.parent) &&
        node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
      if (ts.isTemplateExpression(node) || (isConcatenation && !inLargerConcatenation)) {
        const parts = pieces(node)
        // A fully dynamic expression cannot justify retaining every resource.
        if (parts.some((part) => typeof part === "string" && part.includes("."))) {
          patterns.push(new RegExp(`^${parts.map((part) => part === null ? "[^.]+" : escapeRegex(part)).join("")}$`))
        }
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression
        const isT = (ts.isIdentifier(callee) && callee.text === "t") ||
          (ts.isPropertyAccessExpression(callee) && callee.name.text === "t")
        const [key, options] = node.arguments
        if (isT && key && ts.isStringLiteralLike(key) && options && ts.isObjectLiteralExpression(options) &&
            options.properties.some((prop) => ts.isPropertyAssignment(prop) &&
              prop.name.getText(sourceFile).replace(/["']/g, "") === "returnObjects" &&
              prop.initializer.kind === ts.SyntaxKind.TrueKeyword)) objectKeys.add(key.text)
      }
      // Direct resource reads also count, for example ar.translation.common.save.
      if (ts.isPropertyAccessExpression(node)) {
        const path = node.getText(sourceFile).match(/^ar\.translation\.(\w+(?:\.\w+)*)$/)
        if (path) literals.add(path[1])
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  return leafKeys(resource).filter((key) => {
    const base = key.replace(pluralSuffix, "")
    return !literals.has(key) && !literals.has(base) &&
      !patterns.some((pattern) => pattern.test(key) || pattern.test(base)) &&
      ![...objectKeys].some((prefix) => key.startsWith(`${prefix}.`))
  }).sort()
}
