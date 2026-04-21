export const SHELL_STEPS = [
  {
    id: 0,
    k: "s1",
    name: "Step 1",
    title: "Overview",
    hint: "Short summary of what you will set up and in what order.",
  },
  {
    id: 1,
    k: "s2",
    name: "Step 2",
    title: "Preparation",
    hint: "Check Python, Docker, and Node once, then continue.",
  },
  {
    id: 2,
    k: "s3",
    name: "Step 3",
    title: "Repository & Bootstrap",
    hint: "Choose integration, register repository path, then run bootstrap in the same step.",
  },
  {
    id: 3,
    k: "s4",
    name: "Step 4",
    title: "Integration & activity",
    hint: "Optional config + Run Integration + active integration logs in one step.",
  },
  {
    id: 4,
    k: "s5",
    name: "Step 5",
    title: "Reports",
    hint: "Pick a saved report and inspect the same rendered layout as production.",
  },
] as const;

export type ShellStepIndex = 0 | 1 | 2 | 3 | 4;
