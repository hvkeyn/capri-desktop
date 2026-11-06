# Craft

The checklist for a task that touches code. Read it before the first edit, not after the last.

- **Read it first.** The whole function you are about to change, and where it is called from. A patch that
  compiles but breaks a caller is not done.
- **One idea per change.** If a task turns out to need two, say so and do the first.
- **Names say what they are.** Match the file's own vocabulary; don't introduce a second word for the
  same thing.
- **Errors are answers.** A failure you read is a minute; a failure you guess at is an hour.
- **Check it the way the project checks it.** Its test command, not a new one you invented.
- **Leave no trace.** No scratch files, no debug prints, no commented-out old code, no TODO you made.
