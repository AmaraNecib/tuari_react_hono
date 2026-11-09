## Verify which character a "whitespace pin" actually pins before deciding a rejection class (🟠 Major)

Issue #334 (follow-up to #234) claimed the #221 pinned behavior "deliberately
preserves internal whitespace (Zs) in recovery keys (wrapped-across-email-line
case)" and worried that "widening the class to Zs would break that pinned
test". The actual pinned test is
`consumeRecoveryKeyInputSchema.parse({ key: "a1b2-c3d4\ne5f6" })`. The
preserved character is **LF (`\n`), category Cc**, NOT Zs. This misreading cut
both ways: (1) the issue's own proposed class `[\p{Cf}\p{Mn}\p{Cc}]` would
have broken the pin (reject all Cc includes `\n`); (2) "excluding Zs to
preserve the pin" was unnecessary. Zs could be rejected anywhere (closing the
issue's own mid-string-NBSP bypass) with ZERO cost to the pin. The fix carved
`[\x09-\x0D]` (tab/LF/VT/FF/CR, the Cc members of ECMAScript WhiteSpace) out
of the Cc rejection, keeping the pin green, and rejected `\p{Zs}` outright.

**Always**: when an issue says "widening class X breaks pinned test Y", open
the pinned test and read the EXACT codepoint it uses before designing the
class. The issue text may misclassify it (here Zs vs Cc). Then verify the
chosen regex against a node matrix of the actual production regex: category
claims are subtle (Mn vs Mc: U+0301 rejected, U+0903 allowed; U+2028/U+2029
are Zl/Zp not Zs; every Zs is ECMAScript WhiteSpace so pure-Zs keys already
fail trim→min; U+2800 braille blank is the only blank So, rejecting all
`\p{So}` would over-reach into ©/emoji). Both debate agents re-verified
independently before the fix shipped.

