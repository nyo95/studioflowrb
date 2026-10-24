# StudioFlow access matrix

Status: ACTIVE (Lead, 2026-10-24, WO-SF-ROLES-01). Generated from the code by
`src/apps/studioflow/access-matrix.test.ts`; never edited by hand. After an intended permission change run

```text
UPDATE_ACCESS_MATRIX=1 node scripts/run-tests.mjs src/apps/studioflow/access-matrix.test.ts
```

and commit the table with the change. The test fails when the table and the code disagree.

## How to read it

One project that is open (active), with a designer-seat phase and a drafter-seat phase. "yes" means the person may, "-" means
not. Columns about documents and phases still need the matching feature permission (MOM, Schedule, Presentation, phase work);
the profiles below carry them. The book is private: only the PIC designer, the PIC drafter and people a PIC invites read it.
Workflow records (the client's answer, site visits) stay visible to everyone who sees the project's work pages.

## The three profiles (owner, 2026-10-24)

- **Designer** and **Drafter**: a PIC position plus the working tools for assigned projects. No templates, no settings.
- **Manager**: for the one person who runs the studio's setup. Everything a Designer can do on any project (so status
  can be updated when a PIC is away), plus templates and settings, client and project operations, and Timeline dates. Not a
  PIC unless also given the Designer or Drafter profile. Does not read private books. Answers a client round with the
  buttons in the phase strip, not through the book.
- **Platform Owner**: holds every permission, including the destructive reset of a phase's history, and no PIC seat.

## Matrix

<!-- access-matrix:begin -->
| Who | Sees the project's work pages | Reads the private book | Edits project info and assigns PICs | Edits documents (with the feature permission) | Moves designer-seat phases | Moves drafter-seat phases | Manages templates and settings | Sets Timeline dates | Resets phase history | Can be picked as PIC |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Platform Owner (holds everything, no PIC seat) | yes | - | yes | yes | yes | yes | yes | yes | yes | - |
| Manager (not on the project) | yes | - | yes | yes | yes | yes | yes | yes | - | - |
| Designer, PIC designer of the project | yes | yes | - | yes | yes | yes | - | - | - | yes |
| Designer, not on the project | - | - | - | - | - | - | - | - | - | yes |
| Drafter, PIC drafter of the project | yes | yes | - | yes | - | yes | - | - | - | yes |
| Designer invited to the book | yes | yes | - | - | - | - | - | - | - | yes |
| Signed in with access only | - | - | - | - | - | - | - | - | - | - |
<!-- access-matrix:end -->
