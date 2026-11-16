## 1.0.3 (2026-09-20)

### Bug fixes

Allow optional commas after match arms.

Support default values for const generic parameters.

Support attributes on generic parameters.

Support `_` as inferred type in general type context.

Add support for labeled blocks.

Support numeric fields in struct expressions.

Support exclusive and upper-bounded range patterns.

Support underscore aliases in use declarations.

Support expressions in attribute name-value inputs.

Support async closures.

Support self in extern crate declarations.

Support unnamed constants.

Support const blocks.

Support where clauses on type aliases.

Support generic associated types.

Support nested reference types, patterns, and expressions.

Support attributes on expression statements.

Support underscore assignments.

Support attributes on array elements.

Support associated type bounds in generic arguments.

Support underscore aliases in extern crate declarations.

Support unsafe extern blocks in Edition 2024.

Support use<...> bounds on impl Trait types.

Support parenthesized trait bounds.

Support let conditions after boolean operands and in match guards.

Support inferred array repeat lengths.

Support turbofish syntax in struct expressions.

Support `?` bounds after `impl Trait`.

Support raw borrow expressions.

Support negative numeric const arguments.

Support named and underscore parameters in function pointer types.

Support `@` and `~` in macro token trees.

Support let-else statements.

Support named C variadic parameters.

Support post-definition where clauses on associated types.

Support unsafe attributes.

Support parenthesized `?Sized`, higher-ranked bounds after `+`, and `[const]`, `const`, and `~const` bounds.

Support `%` in macro token trees.

Support repeated slashes in block comments.

Support bounds on generic associated types.

Support cooked C string literals.

Support raw lifetimes.

Support all Rust whitespace characters.

Support bracketed macro_rules definitions.

Support declarative macro items.

Support let-first let chains.

Support leading bars in patterns.

Support colons after metavariables in macro transcribers.

Support lifetimes in deeply nested generic types.

Support safety qualifiers on foreign functions and statics.

Support try blocks.

Support less-than-or-equal comparisons after casts.

Support byte order marks and shebangs.

## 1.0.2 (2023-12-28)

### Bug fixes

Tag comments and strings as isolating for the purpose of bidirectional text.

## 1.0.1 (2023-07-03)

### Bug fixes

Make the package work with new TS resolution styles.

## 1.0.0 (2022-06-06)

### New features

First stable version.

## 0.16.1 (2022-04-26)

### Bug fixes

Allow arbitrary bracketed token trees to appear after attribute names

## 0.16.0 (2022-04-20)

### Breaking changes

Move to 0.16 serialized parser format.

### New features

The parser now includes syntax highlighting information in its node types.

## 0.15.1 (2022-03-21)

### Bug fixes

Allow arbitrary token trees after `=` in attributes.

## 0.15.0 (2021-08-11)

### Breaking changes

The module's name changed from `lezer-rust` to `@lezer/rust`.

Upgrade to the 0.15.0 lezer interfaces.

## 0.13.1 (2020-12-04)

### Bug fixes

Fix versions of lezer packages depended on.

## 0.13.0 (2020-12-04)

## 0.12.0 (2020-10-23)

### Breaking changes

Adjust to changed serialized parser format.

## 0.11.1 (2020-10-01)

### New features

Expression statements are now wrapped in an `ExpressionStatement` node.

The package now provides TypeScript type definitions.

## 0.11.0 (2020-09-29)

### Breaking changes

First numbered release.
