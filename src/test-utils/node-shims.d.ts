// Vitest runs in Node, but the project's type-check has no @types/node (it
// would retype browser globals such as setTimeout). Tests that need Node
// declare exactly what they use here.
declare const process: { env: Record<string, string | undefined> } | undefined;
