/*---------------------------------------------------------------------------*\
  Types for `caseSlug.mjs`.

  The bridge is plain ESM JavaScript -- it runs under bare node, outside the
  app's build -- so the TypeScript test that exercises its rule needs this
  declaration to see the two functions rather than `any`.  Kept beside the
  implementation, and deliberately minimal: it declares the SHAPE, and the
  behaviour is pinned by tests/caseSlugAdoption.test.ts.
\*---------------------------------------------------------------------------*/

export function slugifyName(raw: unknown): string;

export function adoptExistingCase(
  slug: string,
  folders: string[] | undefined | null,
): { name: string } | { error: string } | null;
